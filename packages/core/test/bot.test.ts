import { describe, expect, it } from 'vitest';
import { BOTS, Game, Position, chooseBotMove, perft, positionFromMoves, suggestMove } from '../src';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('bot engine move generation (perft)', () => {
  const cases: [string, number, number][] = [
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
  ];
  for (const [fen, depth, nodes] of cases) {
    it(`${fen.split(' ')[0]} depth ${depth}`, () => {
      expect(perft(new Position(fen), depth)).toBe(nodes);
    });
  }
});

describe('bots', () => {
  it('has eight levels with increasing strength', () => {
    expect(BOTS).toHaveLength(8);
    for (let i = 1; i < BOTS.length; i++) expect(BOTS[i]!.rating).toBeGreaterThan(BOTS[i - 1]!.rating);
  });

  it('every level returns a legal move', () => {
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];
    for (const bot of BOTS) {
      const m = chooseBotMove({ ...bot, timeMs: Math.min(bot.timeMs, 300) }, { moves, random: seeded(bot.level) });
      expect(Game.fromUciMoves(moves).isLegal(m.uci)).toBe(true);
    }
  });

  it('finds mate in one at level 2 and above', () => {
    // Scholar's mate pattern: Qxf7#.
    const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'];
    for (const bot of BOTS.slice(1)) {
      expect(chooseBotMove({ ...bot, timeMs: 300 }, { moves, random: seeded(7) }).uci).toBe('h5f7');
    }
  });

  it('strong level wins a hanging queen', () => {
    const r = suggestMove({ moves: [], startFen: 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', timeMs: 500 });
    expect(r.best).toBe('f3g5');
  });

  it('finds a forced mate in two', () => {
    const r = suggestMove({ moves: [], startFen: 'k7/8/2K5/8/8/8/8/1R5R w - - 0 1', timeMs: 1000 });
    expect(r.mateIn).toBe(2);
  });

  it('keeps repetition history from the move list', () => {
    const pos = positionFromMoves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(pos.isRepetition()).toBe(true);
  });
});
