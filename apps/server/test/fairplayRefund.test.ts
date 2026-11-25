import { openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { MessageService } from '../src/messages/service';
import { ChessServer } from '../src/server';

/**
 * Refunding the opponents of an account under a fair-play case, without
 * closing it and without telling them whose account it was.
 */

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';

let h: DbHandle;
let auth: AuthService;
let admin: AdminService;
let server: ChessServer;
let base: string;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
const notices: { to: string; title: string; body: string }[] = [];

async function signup(username: string) {
  const r = await auth.signup({ username, email: `${username}@example.com`, password: PASSWORD });
  tokens[username] = r.tokens.accessToken;
  ids[username] = r.user.id;
}

async function call(as: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens[as]}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** A finished rated game the suspect won, costing the opponent `loss` points. */
function finished(gameId: string, opponent: string, loss: number, endedAt: number) {
  server.fairPlay.gameFinished({
    gameId,
    initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [],
    thinkMs: [],
    white: { id: ids.suspect!, rating: 1500 },
    black: { id: ids[opponent]!, rating: 1500 },
    endedAt,
    rated: true,
    timeControl: { initialMs: 300_000, incrementMs: 0 },
    ratingDelta: { w: loss, b: -loss },
  });
}

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'suspect', 'alice', 'bob']) await signup(u);
  admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner']);
  const messages = new MessageService({ db: h.db, isStaff: (id) => admin.roleOf(id) !== 'user' });
  admin.messages = messages;
  server = new ChessServer({
    messages,
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    http: [authRoutes(auth, { rateLimit: false })],
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
  await call('owner', 'POST', `/players/${ids.mod}/role`, { role: 'moderator', reason: 'test' });

  const now = Date.now();
  // Three games against alice, one against bob, newest first.
  finished('g-new-1', 'alice', 8, now - 1_000);
  finished('g-new-2', 'alice', 6, now - 2_000);
  finished('g-new-3', 'bob', 5, now - 3_000);
  // An older one, outside a refund of the last three games.
  finished('g-old', 'alice', 20, now - 900_000);
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
  notices.length = 0;
});

describe('refunding a case’s opponents', () => {
  it('is for admins only', async () => {
    expect((await call('alice', 'POST', `/fairplay/${ids.suspect}/refund`, { games: 3 })).status).toBe(403);
    expect((await call('mod', 'POST', `/fairplay/${ids.suspect}/refund`, { games: 3 })).status).toBe(403);
  });

  it('reaches back exactly as far as the moderator chose', async () => {
    const r = await call('owner', 'POST', `/fairplay/${ids.suspect}/refund`, { games: 3, note: 'clear enough to put the points back' });
    expect(r.status).toBe(200);
    // The three newest games only: alice twice, bob once. The old one is untouched.
    expect(r.body.players).toBe(2);
    expect(r.body.refunds.map((x: { gameId: string }) => x.gameId).sort()).toEqual(['g-new-1', 'g-new-2', 'g-new-3']);
    const alice = r.body.refunds.filter((x: { playerId: string }) => x.playerId === ids.alice);
    expect(alice.reduce((n: number, x: { points: number }) => n + x.points, 0)).toBeCloseTo(14, 5);
  });

  it('never refunds the same game twice', async () => {
    const again = await call('owner', 'POST', `/fairplay/${ids.suspect}/refund`, { games: 3 });
    expect(again.status).toBe(200);
    expect(again.body.refunds).toHaveLength(0);
    expect(again.body.players).toBe(0);
  });

  it('tells each refunded player, without naming the account', async () => {
    const n = server.notifications.store.list(ids.alice!, { limit: 10 });
    const refund = n.find((x) => x.title === 'Rating points returned');
    expect(refund).toBeTruthy();
    expect(refund!.body).toContain('rating points');
    expect(refund!.body).not.toContain('suspect');
  });

  it('can still reach further back on a later pass', async () => {
    const r = await call('owner', 'POST', `/fairplay/${ids.suspect}/refund`, { games: 10 });
    expect(r.status).toBe(200);
    expect(r.body.refunds.map((x: { gameId: string }) => x.gameId)).toEqual(['g-old']);
  });
});
