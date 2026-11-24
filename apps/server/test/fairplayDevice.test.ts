import { Game, toWhitePov, type Score } from '@chessmate/core';
import { describe, expect, it } from 'vitest';

import { FairPlayService, evalsFromDevice, parseDepth, type GameForAnalysis } from '../src/fairplay';
import { MemoryPlayerStore } from '../src/players';

/** A short legal game that ends in Scholar's mate, so it has a terminal position. */
const MATE_MOVES = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

/** Walks a game and gives every position an evaluation in the shape a device sends. */
function deviceEvals(moves: string[], initialFen?: string, cp = 20): { score: Score; bestMove: string | null }[] {
  const g = initialFen ? new Game(initialFen) : new Game();
  const out: { score: Score; bestMove: string | null }[] = [];
  for (let i = 0; i <= moves.length; i++) {
    const legal = g.legalMoves();
    const best = legal[0];
    out.push({ score: { cp }, bestMove: best ? `${best.from}${best.to}${best.promotion ?? ''}` : null });
    const uci = moves[i];
    if (uci === undefined) break;
    g.move(uci);
  }
  return out;
}

describe('evalsFromDevice', () => {
  it('accepts one well-formed evaluation per position', () => {
    const r = evalsFromDevice(new Game().fen, MATE_MOVES, deviceEvals(MATE_MOVES));
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.evals).toHaveLength(MATE_MOVES.length + 1);
  });

  it('flips scores to White’s point of view', () => {
    const moves = ['e2e4'];
    const sent = [
      { score: { cp: 30 }, bestMove: 'e2e4' },
      // Black to move: +50 for Black is -50 for White.
      { score: { cp: 50 }, bestMove: 'e7e5' },
    ];
    const r = evalsFromDevice(new Game().fen, moves, sent);
    if ('error' in r) throw new Error(r.error);
    expect(r.evals[0]!.score).toEqual({ cp: 30 });
    expect(r.evals[1]!.score).toEqual({ cp: -50 });
    expect(toWhitePov({ cp: 50 }, 'b')).toEqual({ cp: -50 });
  });

  it('scores the final checkmate from the board, not from what was sent', () => {
    const sent = deviceEvals(MATE_MOVES);
    sent[sent.length - 1] = { score: { cp: -900 }, bestMove: 'a1a2' };
    const r = evalsFromDevice(new Game().fen, MATE_MOVES, sent);
    if ('error' in r) throw new Error(r.error);
    expect(r.evals[r.evals.length - 1]).toEqual({ bestMove: null, score: { mate: 1 } });
  });

  it('rejects the wrong number of evaluations', () => {
    expect(evalsFromDevice(new Game().fen, MATE_MOVES, deviceEvals(MATE_MOVES).slice(1))).toEqual({ error: 'Need one evaluation per position' });
  });

  it('rejects a best move that is not legal in its position', () => {
    const sent = deviceEvals(MATE_MOVES);
    sent[2] = { score: { cp: 10 }, bestMove: 'a7a5' };
    const r = evalsFromDevice(new Game().fen, MATE_MOVES, sent);
    expect(r).toEqual({ error: 'Invalid evaluation for position 2' });
  });

  it('rejects malformed moves and scores', () => {
    const bad = deviceEvals(MATE_MOVES);
    bad[1] = { score: { cp: 10 }, bestMove: 'resign' as string };
    expect(evalsFromDevice(new Game().fen, MATE_MOVES, bad)).toHaveProperty('error');
    const noScore = deviceEvals(MATE_MOVES);
    (noScore[1] as unknown as Record<string, unknown>).score = 'winning';
    expect(evalsFromDevice(new Game().fen, MATE_MOVES, noScore)).toHaveProperty('error');
  });

  it('only takes a plausible search depth', () => {
    expect(parseDepth(14)).toBe(14);
    expect(parseDepth(4)).toBeNull();
    expect(parseDepth(14.5)).toBeNull();
    expect(parseDepth('14')).toBeNull();
    expect(parseDepth(undefined)).toBeNull();
  });
});

describe('recordAnalysis', () => {
  const longGame = (): GameForAnalysis => {
    const g = new Game();
    const moves: string[] = [];
    // A long, legal, repetitive game: enough plies for the analysis to measure.
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    while (moves.length < 60) {
      const uci = cycle[moves.length % cycle.length]!;
      g.move(uci);
      moves.push(uci);
    }
    return {
      gameId: 'g1',
      initialFen: new Game().fen,
      moves,
      thinkMs: moves.map(() => 3000),
      white: { id: 'white', rating: 1500 },
      black: { id: 'black', rating: 1500 },
      endedAt: Date.now(),
    };
  };

  const service = () => new FairPlayService(new MemoryPlayerStore(), { log: () => {} });

  it('marks reports from a device and keeps the depth and moderator', () => {
    const s = service();
    const g = longGame();
    const r = evalsFromDevice(g.initialFen, g.moves, deviceEvals(g.moves));
    if ('error' in r) throw new Error(r.error);
    const reports = s.recordAnalysis(g, r.evals, { source: 'device', depth: 14, by: 'ahmad' });
    expect(reports.length).toBeGreaterThan(0);
    for (const rep of reports) {
      expect(rep.source).toBe('device');
      expect(rep.depth).toBe(14);
      expect(rep.by).toBe('ahmad');
    }
    expect(s.store.reportsFor('white', 20)).toHaveLength(1);
  });

  it('replaces a game’s earlier report when it is analysed again', () => {
    const s = service();
    const g = longGame();
    const r = evalsFromDevice(g.initialFen, g.moves, deviceEvals(g.moves));
    if ('error' in r) throw new Error(r.error);
    s.recordAnalysis(g, r.evals, { source: 'server' });
    s.recordAnalysis(g, r.evals, { source: 'device', depth: 16, by: 'ahmad' });
    const kept = s.store.reportsFor('white', 20);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.source).toBe('device');
    expect(kept[0]!.depth).toBe(16);
  });
});
