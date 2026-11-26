import { Game, START_FEN, type GameReview, type PositionEval } from '@chessmate/core';
import { createGame, ensureUser, finishGame, openDb, type DbHandle } from '@chessmate/db';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gameRoutes } from '../src/games/http';
import { reviewFromUpload } from '../src/games/reviewUpload';
import { dbGamesOf } from '../src/profiles';

let h: DbHandle;
let http: Server;
let base: string;
const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];

/** What a device engine sends: one evaluation per position. */
function evalsFor(ms: string[], depth = 12): PositionEval[] {
  const g = new Game(START_FEN);
  const out: PositionEval[] = [];
  for (let i = 0; i <= ms.length; i++) {
    const first = g.legalMoves()[0];
    const best = first ? `${first.from}${first.to}` : 'a2a3';
    out.push({ score: { cp: 20 }, bestMove: best, pv: [best], depth, secondScore: { cp: 10 } });
    if (i < ms.length) g.move(ms[i]!);
  }
  return out;
}

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  for (const [id, username] of [
    ['u_white', 'white'],
    ['u_black', 'black'],
    ['u_other', 'other'],
  ] as const)
    await ensureUser(h.db, { id, username, email: `${username}@example.com` } as never);
  await createGame(h.db, {
    id: 'g1',
    white: { id: 'u_white', name: 'white', rating: 1500 },
    black: { id: 'u_black', name: 'black', rating: 1500 },
    timeControl: { initialMs: 180_000, incrementMs: 0 },
    rated: false,
    initialFen: START_FEN,
  });
  const { addMove } = await import('@chessmate/db');
  const g = new Game(START_FEN);
  for (let i = 0; i < moves.length; i++) {
    const m = g.move(moves[i]!)!;
    await addMove(h.db, 'g1', { ply: i + 1, uci: m.uci, san: m.san, fenAfter: g.fen });
  }
  await finishGame(h.db, 'g1', { outcome: { result: '1-0', winner: 'w', reason: 'resignation' }, pgn: '', finalFen: g.fen, plyCount: moves.length });
  const route = gameRoutes(h.db, { viewerOf: (t) => (t.startsWith('tok_') ? t.slice(4) : null), gamesHidden: async () => false });
  http = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (!(await route(req, res, url))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => http.listen(0, r));
  base = `http://localhost:${(http.address() as { port: number }).port}`;
});
afterAll(async () => {
  http.close();
  await h.close();
});

const call = async (method: string, path: string, who?: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(who ? { authorization: `Bearer tok_${who}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as { review?: GameReview; game?: { accuracy: unknown }; error?: string } };
};

describe('saved game reviews', () => {
  it('is for signed-in players only', async () => {
    expect((await call('GET', '/api/games/g1/review')).status).toBe(401);
    expect((await call('POST', '/api/games/g1/review', undefined, { evals: evalsFor(moves) })).status).toBe(401);
  });

  it('has nothing saved until a player reviews the game', async () => {
    expect((await call('GET', '/api/games/g1/review', 'u_other')).status).toBe(404);
    expect((await call('GET', '/api/games/g1')).body.game!.accuracy).toBeNull();
  });

  it('only lets the players save a standard review', async () => {
    const r = await call('POST', '/api/games/g1/review', 'u_other', { evals: evalsFor(moves) });
    expect(r.status).toBe(403);
  });

  it('rejects evaluations that do not fit the game', async () => {
    expect((await call('POST', '/api/games/g1/review', 'u_white', { evals: evalsFor(moves).slice(1) })).status).toBe(400);
    expect((await call('POST', '/api/games/g1/review', 'u_white', { evals: evalsFor(moves, 3) })).status).toBe(400);
    const bad = evalsFor(moves);
    bad[1] = { ...bad[1]!, bestMove: 'e2e4' }; // not legal for Black
    expect((await call('POST', '/api/games/g1/review', 'u_white', { evals: bad })).status).toBe(400);
  });

  it('saves the first review, grades it on the server, and serves it to everyone after', async () => {
    const first = await call('POST', '/api/games/g1/review', 'u_white', { evals: evalsFor(moves), accuracy: { w: 100, b: 100 } });
    expect(first.status).toBe(200);
    expect(first.body.review!.moves.map((m) => m.uci)).toEqual(moves);
    // A second upload as deep (or shallower) does not replace it.
    const second = await call('POST', '/api/games/g1/review', 'u_black', { evals: evalsFor(moves, 12) });
    expect(second.body.review).toEqual(first.body.review);
    const shallower = evalsFor(moves, 20);
    shallower[2] = { ...shallower[2]!, depth: 10 };
    expect((await call('POST', '/api/games/g1/review', 'u_black', { evals: shallower })).body.review).toEqual(first.body.review);
    // Anyone signed in reads the saved one.
    const seen = await call('GET', '/api/games/g1/review', 'u_other');
    expect(seen.body.review!.accuracy).toEqual(first.body.review!.accuracy);
    expect((await call('GET', '/api/games/g1')).body.game!.accuracy).toEqual(first.body.review!.accuracy);
    // The profile's recent games carry the accuracy too.
    const [row] = await dbGamesOf(h.db)('u_black', 5);
    expect(row!.accuracy).toEqual(first.body.review!.accuracy);
  });

  it('replaces the saved review with one that searched deeper (a Deep review)', async () => {
    const deep = evalsFor(moves, 18);
    deep[3] = { ...deep[3]!, depth: 20 };
    const r = await call('POST', '/api/games/g1/review', 'u_black', { evals: deep });
    expect(r.status).toBe(200);
    expect(r.body.review).toMatchObject({ depth: 18, maxDepth: 20 });
    expect((await call('GET', '/api/games/g1/review', 'u_other')).body.review).toMatchObject({ depth: 18, maxDepth: 20 });
    // Still only deeper ones.
    expect((await call('POST', '/api/games/g1/review', 'u_white', { evals: evalsFor(moves, 18) })).body.review).toMatchObject({ depth: 18, maxDepth: 20 });
    // Someone who did not play the game cannot save a standard review over it.
    expect((await call('POST', '/api/games/g1/review', 'u_other', { evals: evalsFor(moves, 14) })).status).toBe(403);
    // Invalid evaluations are still refused, deeper or not.
    expect((await call('POST', '/api/games/g1/review', 'u_white', { evals: evalsFor(moves, 22).slice(1) })).status).toBe(400);
  });

  it('lets anyone signed in replace it with a deeper Deep review, not only the players', async () => {
    // As deep as the saved one: kept.
    const same = await call('POST', '/api/games/g1/review', 'u_other', { evals: evalsFor(moves, 18) });
    expect(same.status).toBe(200);
    expect(same.body.review).toMatchObject({ depth: 18, maxDepth: 20 });
    // Deeper: replaces it for everyone.
    const deeper = await call('POST', '/api/games/g1/review', 'u_other', { evals: evalsFor(moves, 24) });
    expect(deeper.status).toBe(200);
    expect(deeper.body.review).toMatchObject({ depth: 24 });
    expect((await call('GET', '/api/games/g1/review', 'u_white')).body.review).toMatchObject({ depth: 24 });
    // Invalid evaluations are refused from anyone.
    expect((await call('POST', '/api/games/g1/review', 'u_other', { evals: evalsFor(moves, 30).slice(1) })).status).toBe(400);
  });
});

describe('reviewFromUpload', () => {
  it('fills finished positions itself', () => {
    const mate = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const evals = evalsFor(mate) as unknown[];
    evals[4] = null; // checkmate: the server knows the score
    const r = reviewFromUpload(START_FEN, mate, evals);
    expect('review' in r && r.review.moves.at(-1)!.san).toBe('Qh4#');
  });

  it('grades masters theory as Book when the server says how far it goes', () => {
    // Italian, Giuoco Pianissimo: the named openings' book ends after 7. a4 O-O; masters keep playing 8. Re1 Ba7 9. h3 h6.
    const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6', 'e1g1', 'a7a6', 'a2a4', 'e8g8', 'f1e1', 'c5a7', 'h2h3', 'h7h6'];
    const evals = evalsFor(line).map((e) => ({ ...e, score: { cp: 25 } }));
    const books = (theoryPlies?: number) => {
      const r = reviewFromUpload(START_FEN, line, evals, { theoryPlies });
      return 'review' in r ? r.review.moves.filter((m) => m.judgement.classification === 'book').length : -1;
    };
    expect(books()).toBe(14);
    expect(books(line.length)).toBe(line.length);
  });
});
