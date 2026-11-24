import { Game, type Score } from '@chessmate/core';
import { addMove, createGame, finishGame, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { MessageService } from '../src/messages/service';
import { ChessServer } from '../src/server';

/**
 * The whole moderator-device path over real HTTP: list a case's games, analyse
 * them "on a device", post the results, see the evidence on the case file.
 */

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';
const GAME_ID = 'case-game-1';

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

/** A long legal game: shuffling knights, so it is well past the opening plies the analysis skips. */
function shuffleGame(plies: number): string[] {
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  return Array.from({ length: plies }, (_, i) => cycle[i % cycle.length]!);
}

/** What a moderator's device sends: a score and a best move per position. */
function deviceEvals(initialFen: string, moves: string[], cp = 25): { score: Score; bestMove: string | null }[] {
  const g = new Game(initialFen);
  const out: { score: Score; bestMove: string | null }[] = [];
  for (let i = 0; i <= moves.length; i++) {
    const best = g.legalMoves()[0];
    out.push({ score: { cp }, bestMove: best ? `${best.from}${best.to}${best.promotion ?? ''}` : null });
    const uci = moves[i];
    if (uci === undefined) break;
    g.move(uci);
  }
  return out;
}

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'alice', 'bob']) await signup(u);
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
    // The point of this feature: a server with no engine of its own.
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;

  const moves = shuffleGame(60);
  const g = new Game();
  await createGame(h.db, {
    id: GAME_ID,
    white: { id: ids.alice!, name: 'alice', rating: 1500 },
    black: { id: ids.bob!, name: 'bob', rating: 1500 },
    timeControl: { initialMs: 300_000, incrementMs: 0 },
    rated: true,
    initialFen: g.fen,
  });
  for (const [i, uci] of moves.entries()) {
    const before = g.fen;
    g.move(uci);
    await addMove(h.db, GAME_ID, { ply: i + 1, uci, san: uci, fenAfter: g.fen, spentMs: 3000 + (i % 7) * 400 });
    void before;
  }
  await finishGame(h.db, GAME_ID, {
    outcome: { result: '1/2-1/2', reason: 'draw_agreement', winner: null },
    pgn: '',
    finalFen: g.fen,
    plyCount: moves.length,
  });
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('analysing a case on a moderator device', () => {
  it('needs a staff account', async () => {
    expect((await call('alice', 'GET', `/fairplay/${ids.bob}/games`)).status).toBe(403);
    expect((await call('alice', 'POST', `/fairplay/${ids.bob}/analysis`, { gameId: GAME_ID, depth: 14, evals: [] })).status).toBe(403);
  });

  it('lists the account’s recent rated games with everything the engine needs', async () => {
    const r = await call('owner', 'GET', `/fairplay/${ids.bob}/games`);
    expect(r.status).toBe(200);
    expect(r.body.games).toHaveLength(1);
    const g = r.body.games[0];
    expect(g.gameId).toBe(GAME_ID);
    expect(g.moves).toHaveLength(60);
    expect(g.thinkMs).toHaveLength(60);
    expect(g.black.id).toBe(ids.bob);
    expect(g.white.rating).toBe(1500);
    expect(g.analyzed).toBe(false);
  });

  it('takes the device results and shows the evidence on the case file', async () => {
    const list = await call('owner', 'GET', `/fairplay/${ids.bob}/games`);
    const game = list.body.games[0];
    const evals = deviceEvals(game.initialFen, game.moves);

    const posted = await call('owner', 'POST', `/fairplay/${ids.bob}/analysis`, { gameId: GAME_ID, depth: 14, evals });
    expect(posted.status).toBe(200);
    expect(posted.body.reports.length).toBeGreaterThan(0);
    expect(posted.body.reports[0].source).toBe('device');

    const file = await call('owner', 'GET', `/fairplay/${ids.bob}`);
    expect(file.status).toBe(200);
    expect(file.body.reports.length).toBeGreaterThan(0);
    expect(file.body.reports[0].gameId).toBe(GAME_ID);
    expect(file.body.reports[0].depth).toBe(14);
    expect(file.body.reports[0].by).toBe('owner');
    expect(file.body.log.some((e: { action: string }) => e.action === 'analyzed')).toBe(true);

    // The same game now counts as analysed, so a second run does not redo it.
    const again = await call('owner', 'GET', `/fairplay/${ids.bob}/games`);
    expect(again.body.games[0].analyzed).toBe(true);
  });

  it('refuses results that do not fit the stored game', async () => {
    const r = await call('owner', 'POST', `/fairplay/${ids.bob}/analysis`, { gameId: GAME_ID, depth: 14, evals: [{ score: { cp: 0 }, bestMove: null }] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('one evaluation per position');
    const shallow = await call('owner', 'POST', `/fairplay/${ids.bob}/analysis`, { gameId: GAME_ID, depth: 3, evals: [] });
    expect(shallow.status).toBe(400);
    const other = await call('owner', 'POST', `/fairplay/${ids.alice}/analysis`, { gameId: 'no-such-game', depth: 14, evals: [] });
    expect(other.status).toBe(404);
  });
});
