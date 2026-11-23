import { describe, expect, it } from 'vitest';
import { UciEngine, resolveEngineCommand } from '../src/engine';

/** Runs the real engine (npm WebAssembly build, or STOCKFISH_PATH). */
describe('Stockfish process', () => {
  it('finds mate in one and reports multiple lines', async () => {
    const engine = await UciEngine.start(resolveEngineCommand());
    try {
      // Back-rank mate: Ra8#.
      const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
      const res = await engine.search(fen, { multipv: 3, depth: 8 });
      expect(res.bestMove).toBe('a1a8');
      expect(res.lines.get(1)?.score).toEqual({ mate: 1 });
      expect(res.lines.size).toBe(3);
      // Stop works on a long search.
      const ctrl = new AbortController();
      const started = Date.now();
      const p = engine.search('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { multipv: 1, movetimeMs: 10_000 }, undefined, ctrl.signal);
      setTimeout(() => ctrl.abort(), 300);
      const r2 = await p;
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(r2.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]/);
    } finally {
      engine.close();
    }
  }, 60_000);
});

/** A review built from real engine results (as the app's device engine produces them) finds the Masterpiece in a smothered mate. */
describe('Stockfish review badges', () => {
  it('gives !!! to Qg8+ before Nf7#', async () => {
    const { Game, buildReview, positionEvalFrom, terminalScore, terminalState } = await import('@chessmate/core');
    const engine = await UciEngine.start(resolveEngineCommand());
    try {
      const initialFen = '5r1k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1';
      const moves = ['d5g8', 'f8g8', 'h6f7'];
      const g = new Game(initialFen);
      const fens = [g.fen, ...moves.map((m) => (g.move(m), g.fen))];
      const evals = [];
      for (const fen of fens) {
        const term = terminalState(fen);
        if (term) {
          evals.push({ score: terminalScore(fen, term), pv: [], depth: 0 });
          continue;
        }
        const res = await engine.search(fen, { multipv: 2, depth: 12, movetimeMs: 1500 });
        evals.push(positionEvalFrom(fen, res.lines.get(1) ?? null, res.bestMove ?? undefined, res.lines.get(2) ?? null));
      }
      const review = buildReview(initialFen, moves, evals);
      expect(review.moves.map((m) => m.judgement.classification)).toEqual(['masterpiece', 'forced', 'great']);
    } finally {
      engine.close();
    }
  }, 60_000);
});
