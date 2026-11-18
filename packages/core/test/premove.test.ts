import { describe, expect, it } from 'vitest';
import { applyPremoves, isPromotionMove, premoveDests } from '../src';

describe('premoveDests', () => {
  it('includes geometric moves through pieces and recapture squares', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(premoveDests(start, 'b', 'e7').sort()).toEqual(['d6', 'e5', 'e6', 'f6']);
    expect(premoveDests(start, 'b', 'd8')).toContain('h4');
    expect(premoveDests(start, 'b', 'e8')).toEqual(expect.arrayContaining(['g8', 'c8']));
    expect(premoveDests(start, 'w', 'e7')).toEqual([]);
  });
});

describe('premove queue', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('applies queued premoves geometrically so the next one starts from there', () => {
    const fen = applyPremoves(start, [
      { from: 'e2', to: 'e4' },
      { from: 'g1', to: 'f3' },
      { from: 'f1', to: 'c4' },
    ]);
    expect(fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQK2R');
    // Castling still allowed: king and rook are home.
    expect(premoveDests(fen, 'w', 'e1')).toContain('g1');
    const castled = applyPremoves(fen, [{ from: 'e1', to: 'g1' }]);
    expect(castled.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQ1RK1');
    expect(castled.split(' ')[2]).toBe('kq');
  });

  it('promotes with the chosen piece, a queen by default', () => {
    const fen = '7k/P7/8/8/8/8/8/K7 b - - 0 1';
    expect(isPromotionMove(fen, 'a7', 'a8')).toBe(true);
    expect(isPromotionMove(fen, 'a1', 'a2')).toBe(false);
    expect(applyPremoves(fen, [{ from: 'a7', to: 'a8' }]).split(' ')[0]).toBe('Q6k/8/8/8/8/8/8/K7');
    expect(applyPremoves(fen, [{ from: 'a7', to: 'a8', promotion: 'n' }]).split(' ')[0]).toBe('N6k/8/8/8/8/8/8/K7');
  });

  it('never premoves onto the enemy king', () => {
    expect(premoveDests('5k2/8/8/8/8/8/8/4KR2 b - - 0 1', 'w', 'f1')).not.toContain('f8');
  });
});
