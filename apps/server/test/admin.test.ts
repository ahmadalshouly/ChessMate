import { decodeServer, encode, type ClientMessage } from '@chessmate/core';
import { getUser, listAudit, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { ChessServer } from '../src/server';

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';

let h: DbHandle;
let auth: AuthService;
let admin: AdminService;
let server: ChessServer;
let base: string;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

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

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'alice', 'bob']) await signup(u);
  admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner', 'nobody_yet']);
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    http: [authRoutes(auth, { rateLimit: false })],
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('admin console', () => {
  it('only lets staff in, and ADMIN_USERNAMES makes the owner an admin', async () => {
    expect((await call('alice', 'GET', '/me')).status).toBe(403);
    const me = await call('owner', 'GET', '/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('admin');
    expect(me.body.permissions).toContain('accounts.close');
    const audit = await listAudit(h.db, { targetId: ids.owner });
    expect(audit[0]?.action).toBe('role.change');
    // The role reaches the app through /api/auth/me.
    const res = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${tokens.owner}` } });
    expect(((await res.json()) as { user: { role: string } }).user.role).toBe('admin');
  });

  it('makes an ADMIN_USERNAMES account admin as soon as it signs up', async () => {
    await signup('nobody_yet');
    expect(admin.roleOf(ids.nobody_yet!)).toBe('admin');
    expect((await call('nobody_yet', 'GET', '/me')).body.role).toBe('admin');
    await call('owner', 'POST', `/players/${ids.nobody_yet}/role`, { role: 'user' });
  });

  it('gives moderators their own, smaller set of tools', async () => {
    expect((await call('owner', 'POST', `/players/${ids.mod}/role`, { role: 'moderator', reason: 'new mod' })).status).toBe(200);
    expect((await call('owner', 'POST', `/players/${ids.owner}/role`, { role: 'user' })).status).toBe(403);
    const me = await call('mod', 'GET', '/me');
    expect(me.body.role).toBe('moderator');
    // Moderators can warn and mute, but not close accounts, move ratings or see emails.
    expect((await call('mod', 'POST', `/players/${ids.alice}/warn`, { category: 'abusive_chat', message: 'Keep chat friendly' })).status).toBe(200);
    expect((await call('mod', 'POST', `/players/${ids.alice}/mute`, { hours: 24, reason: 'insults' })).status).toBe(200);
    expect((await call('mod', 'POST', `/players/${ids.alice}/close`, { reason: 'abuse' })).status).toBe(403);
    expect((await call('mod', 'POST', `/players/${ids.alice}/rating`, { category: 'blitz', delta: 50, reason: 'x' })).status).toBe(403);
    const seen = await call('mod', 'GET', `/players/${ids.alice}`);
    expect(seen.body.player.email).toBeNull();
    expect(seen.body.player.warnings).toHaveLength(1);
    expect(seen.body.player.chatMute.reason).toBe('insults');
    const asAdmin = await call('owner', 'GET', `/players/${ids.alice}`);
    expect(asAdmin.body.player.email).toBe('alice@example.com');
  });

  it('searches players by name and status', async () => {
    const r = await call('owner', 'GET', '/players?q=ali');
    expect(r.body.players.map((p: { username: string }) => p.username)).toEqual(['alice']);
    const staff = await call('owner', 'GET', '/players?role=staff');
    expect(staff.body.players.map((p: { username: string }) => p.username).sort()).toEqual(['mod', 'owner']);
    const muted = await call('owner', 'GET', '/players?status=muted');
    expect(muted.body.players.map((p: { username: string }) => p.username)).toEqual(['alice']);
  });

  it('adjusts ratings with a reason and keeps them in the database', async () => {
    const r = await call('owner', 'POST', `/players/${ids.bob}/rating`, { category: 'rapid', delta: -120, reason: 'sandbagging' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ before: 1500, after: 1380 });
    expect(server.ratings.get(ids.bob!, 'rapid', Date.now()).rating).toBe(1380);
    expect((await call('owner', 'POST', `/players/${ids.bob}/rating`, { category: 'rapid', delta: 5000, reason: 'x' })).status).toBe(400);
    expect((await call('owner', 'POST', `/players/${ids.bob}/rating`, { category: 'rapid', delta: 10 })).status).toBe(400);
  });

  it('closes an account: no sign-in, no play, live socket kicked; reopening restores it', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    const closed = new Promise<number>((r) => ws.on('close', (c) => r(c)));
    const welcomed = new Promise<void>((r) => ws.on('message', (d) => decodeServer(String(d))?.t === 'welcome' && r()));
    await new Promise((r) => ws.on('open', r));
    ws.send(encode({ t: 'hello', v: 1, token: tokens.alice } as ClientMessage));
    await welcomed;

    const c = await call('owner', 'POST', `/players/${ids.alice}/close`, { reason: 'abuse', note: 'repeated slurs' });
    expect(c.status).toBe(200);
    expect(await closed).toBe(4011);
    expect((await getUser(h.db, ids.alice!))?.closedReason).toBe('abuse');

    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'alice', password: PASSWORD }) });
    expect(login.status).toBe(403);
    expect(((await login.json()) as { error: { code: string } }).error.code).toBe('account_closed');
    expect(auth.verifyAccessToken(tokens.alice!)).toBeNull();
    expect((await call('owner', 'POST', `/players/${ids.alice}/close`, { reason: 'abuse' })).status).toBe(409);
    // Closed players drop out of the leaderboard and friend search, but staff still find them.
    const found = await call('owner', 'GET', '/players?status=closed');
    expect(found.body.players.map((p: { username: string }) => p.username)).toEqual(['alice']);

    expect((await call('owner', 'POST', `/players/${ids.alice}/reopen`, { note: 'appeal accepted' })).status).toBe(200);
    const again = await auth.login({ login: 'alice', password: PASSWORD });
    expect(again.user.username).toBe('alice');
    tokens.alice = again.tokens.accessToken;

    const log = await call('owner', 'GET', `/audit?target=${ids.alice}`);
    expect(log.body.entries.map((e: { action: string }) => e.action)).toEqual(['account.reopen', 'account.close', 'chat.mute', 'player.warn']);
  });

  it('closes for fair play through the fair-play queue and refunds the opponents', async () => {
    server.fairPlay.gameFinished({
      gameId: 'g-fp-1',
      initialFen: 'startpos',
      moves: [],
      thinkMs: [],
      white: { id: ids.bob!, rating: 1500 },
      black: { id: ids.alice!, rating: 1500 },
      endedAt: Date.now(),
      rated: true,
      timeControl: { initialMs: 300_000, incrementMs: 0 },
      ratingDelta: { w: 8, b: -8 },
    });
    const before = server.ratings.get(ids.alice!, 'blitz', Date.now()).rating;
    expect((await call('mod', 'POST', `/fairplay/${ids.bob}/open`, { note: 'reported by several players' })).status).toBe(200);
    expect((await call('mod', 'POST', `/fairplay/${ids.bob}/ban`, {})).status).toBe(403);
    const queue = await call('mod', 'GET', '/fairplay');
    expect(queue.body.cases[0]).toMatchObject({ username: 'bob', status: 'open' });
    const r = await call('owner', 'POST', `/fairplay/${ids.bob}/ban`, { note: 'engine use confirmed' });
    expect(r.status).toBe(200);
    expect(r.body.refunds).toEqual([{ gameId: 'g-fp-1', playerId: ids.alice, category: 'blitz', points: 8 }]);
    expect(server.ratings.get(ids.alice!, 'blitz', Date.now()).rating).toBeCloseTo(before + 8);
    expect(admin.isClosed(ids.bob!)).toBe(true);
    const file = await call('owner', 'GET', `/fairplay/${ids.bob}`);
    expect(file.body.case.status).toBe('banned');
    expect(file.body.player.fairPlay).toBe('banned');
  });

  it('shows dashboard numbers', async () => {
    const d = await call('mod', 'GET', '/dashboard');
    expect(d.status).toBe(200);
    expect(d.body.accounts.total).toBe(5);
    expect(d.body.accounts.closed).toBe(1);
    expect(d.body.accounts.staff).toBe(2);
    expect(d.body.daily).toHaveLength(14);
    expect(d.body.recent.length).toBeGreaterThan(0);
  });
});
