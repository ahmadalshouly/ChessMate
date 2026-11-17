import { describe, expect, it } from 'vitest';
import { refineClass, sacrificedMaterial } from '../src';

describe('move class refinements', () => {
  it('detects a piece left en prise as a sacrifice', () => {
    // 1.e4 e5 2.Ba6: the bishop can be taken by the b7 pawn for nothing.
    const before = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const after = 'rnbqkbnr/pppp1ppp/B7/4p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2';
    expect(sacrificedMaterial(before, after, 'w')).toBeGreaterThanOrEqual(3);
    // 2.Nf3 sacrifices nothing.
    const quiet = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    expect(sacrificedMaterial(before, quiet, 'w')).toBeLessThan(2);
  });
  it('labels sound sacrifices brilliant, winning ones a masterpiece', () => {
    expect(refineClass({ judged: 'best', sacrifice: 3, before: 0.55, after: 0.6 })).toBe('brilliant');
    expect(refineClass({ judged: 'best', sacrifice: 5, before: 0.6, after: 0.96 })).toBe('great');
    expect(refineClass({ judged: 'best', sacrifice: 3, before: 0.6, after: 0.3 })).toBe('best');
    expect(refineClass({ judged: 'good', sacrifice: 3, before: 0.5, after: 0.6 })).toBe('good');
  });
  it('marks failing to punish a mistake as a missed chance, but keeps blunders', () => {
    expect(refineClass({ judged: 'mistake', sacrifice: 0, before: 0.8, after: 0.6, opponentPrevious: 'blunder' })).toBe('miss');
    expect(refineClass({ judged: 'blunder', sacrifice: 0, before: 0.8, after: 0.2, opponentPrevious: 'blunder' })).toBe('blunder');
    expect(refineClass({ judged: 'mistake', sacrifice: 0, before: 0.5, after: 0.3, opponentPrevious: 'good' })).toBe('mistake');
  });
});
