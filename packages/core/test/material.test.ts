import { describe, expect, it } from 'vitest';
import { materialBalance } from '../src';

describe('materialBalance', () => {
  it('is empty and level at the start', () => {
    const m = materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(m).toEqual({ w: { captured: [], advantage: 0 }, b: { captured: [], advantage: 0 } });
  });

  it('lists captures and the lead for the side ahead', () => {
    // 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qxg2?? 4.Bxg2 — white took a pawn and the queen, black took a pawn.
    const m = materialBalance('rnb1kbnr/ppp1pppp/8/8/8/2N5/PPPP1PBP/R1BQK1NR b KQkq - 0 4');
    expect(m.w).toEqual({ captured: ['p', 'q'], advantage: 8 });
    expect(m.b).toEqual({ captured: ['p', 'p'], advantage: 0 });
  });

  it('sorts captures by value', () => {
    const m = materialBalance('r1bqkb1r/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(m.w.captured).toEqual(['n', 'n']);
    expect(m.b.captured).toEqual(['p']);
    expect(m.w.advantage).toBe(5);
  });

  it('does not count a promoted pawn as captured', () => {
    // White promoted the a-pawn to a second queen; nothing was captured by black.
    const m = materialBalance('Q3k3/1ppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR b KQ - 0 1');
    expect(m.b.captured).toEqual([]);
    expect(m.w.captured).toEqual(['p', 'n', 'n', 'b', 'b', 'r', 'r', 'q']);
    expect(m.w.advantage).toBe(40);
  });
});
