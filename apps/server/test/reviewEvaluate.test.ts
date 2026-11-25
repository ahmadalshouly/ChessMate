import { START_FEN, type UciInfo } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalysisService, EnginePool, type Engine, type SearchOptions, type SearchResult } from '../src/engine';
import { ChessServer } from '../src/server';

/** Stand-in for Stockfish that records the limits it was asked to search with. */
class FakeEngine implements Engine {
  alive = true;
  asked: SearchOptions[] = [];
  async search(fen: string, opts: SearchOptions): Promise<SearchResult> {
    this.asked.push(opts);
    const lines = new Map<number, UciInfo>();
    const best = fen.includes(' b ') ? 'e7e5' : 'e2e4';
    for (let pv = 1; pv <= opts.multipv; pv++) lines.set(pv, { depth: opts.depth ?? 10, multipv: pv, score: { cp: 30 - pv * 10 }, pv: [best] });
    await new Promise((r) => setTimeout(r, 2));
    return { lines, bestMove: best };
  }
  close() {
    this.alive = false;
  }
}

let server: ChessServer;
let base: string;
const engine = new FakeEngine();

beforeAll(async () => {
  const analysis = new AnalysisService(new EnginePool(async () => engine, 1));
  server = new ChessServer({ port: 0, matchIntervalMs: 20, analysis });
  base = `http://localhost:${await server.listen()}`;
});
afterAll(() => server.close());

const post = (body: unknown, token?: string) =>
  fetch(`${base}/api/review/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('review evaluation fallback', () => {
  it('evaluates positions for a signed-in player, scores from White', async () => {
    const res = await post({ fens: [START_FEN, AFTER_E4], depth: 12, movetimeMs: 1500 }, 'dev:u_rev1:Reviewer');
    expect(res.status).toBe(200);
    const { evals } = (await res.json()) as { evals: { score: { cp?: number }; bestMove?: string; depth: number; secondScore?: unknown }[] };
    expect(evals).toHaveLength(2);
    expect(evals[0]!.bestMove).toBe('e2e4');
    expect(evals[0]!.score.cp).toBe(20);
    // Black to move: the engine's +20 is -20 for White.
    expect(evals[1]!.score.cp).toBe(-20);
    expect(evals[1]!.depth).toBe(12);
    expect(engine.asked.at(-1)).toMatchObject({ depth: 12, multipv: 2, movetimeMs: 1500 });
  });

  it('clamps the search limits the app asks for', async () => {
    await post({ fens: [START_FEN], depth: 40, movetimeMs: 60_000 }, 'dev:u_rev2:Reviewer');
    expect(engine.asked.at(-1)).toMatchObject({ depth: 18, movetimeMs: 3000 });
  });

  it('needs a signed-in player', async () => {
    expect((await post({ fens: [START_FEN] })).status).toBe(401);
  });

  it('rejects bad positions and oversized batches', async () => {
    expect((await post({ fens: ['not a fen'] }, 'dev:u_rev3:Reviewer')).status).toBe(400);
    // Readable, but Black's king is attacked with White to move: never sent to the engine.
    expect((await post({ fens: ['4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1'] }, 'dev:u_rev3:Reviewer')).status).toBe(400);
    expect((await post({ fens: [] }, 'dev:u_rev3:Reviewer')).status).toBe(400);
    expect((await post({ fens: new Array(9).fill(START_FEN) }, 'dev:u_rev3:Reviewer')).status).toBe(400);
  });

  it('answers 503 when the server runs no engine', async () => {
    const bare = new ChessServer({ port: 0, matchIntervalMs: 20 });
    const p = await bare.listen();
    try {
      const res = await fetch(`http://localhost:${p}/api/review/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer dev:u_rev4:Reviewer' },
        body: JSON.stringify({ fens: [START_FEN] }),
      });
      expect(res.status).toBe(503);
    } finally {
      bare.close();
    }
  });
});
