import { describe, expect, it } from 'vitest';
import { premoveDests } from '../src';

describe('premoveDests', () => {
  it('includes geometric moves through pieces and recapture squares', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(premoveDests(start, 'b', 'e7').sort()).toEqual(['d6', 'e5', 'e6', 'f6']);
    expect(premoveDests(start, 'b', 'd8')).toContain('h4');
    expect(premoveDests(start, 'b', 'e8')).toEqual(expect.arrayContaining(['g8', 'c8']));
    expect(premoveDests(start, 'w', 'e7')).toEqual([]);
  });
});
