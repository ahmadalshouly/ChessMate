import { describe, expect, it } from 'vitest';
import { CollectionInputError, cleanCollectionInput, cleanCollectionItem, collectionLinkKey, collectionPgn, linePgn, pgnMovetext, START_FEN } from '../src';

describe('collections', () => {
  it('tidies names and refuses empty ones', () => {
    expect(cleanCollectionInput({ name: '  Best\n wins ', isPublic: true })).toEqual({ name: 'Best wins', description: null, isPublic: true });
    expect(() => cleanCollectionInput({ name: '   ' })).toThrow(CollectionInputError);
    expect(cleanCollectionInput({ isPublic: false }, true)).toEqual({ isPublic: false });
  });

  it('keeps only links the Share button builds', () => {
    expect(cleanCollectionItem({ title: 'A vs B', link: { path: '/game/abc' }, pgn: '' })).toEqual({ title: 'A vs B', link: { path: '/game/abc' }, pgn: null });
    expect(cleanCollectionItem({ title: 'x', link: { path: '/immortals/game/opera-game', query: { ply: '3' } } }).link.query).toEqual({ ply: '3' });
    for (const path of ['https://evil.example/game/1', '/settings', '//evil.example', '/game/a/b']) {
      expect(() => cleanCollectionItem({ title: 'x', link: { path } })).toThrow(CollectionInputError);
    }
    expect(() => cleanCollectionItem({ title: 'x', link: { path: '/analysis', query: { next: '/admin' } } })).toThrow(CollectionInputError);
  });

  it('treats the same link with its query in another order as the same game', () => {
    expect(collectionLinkKey({ path: '/analysis', query: { ply: '1', moves: 'e2e4' } })).toBe(collectionLinkKey({ path: '/analysis', query: { moves: 'e2e4', ply: '1' } }));
  });

  it('joins the saved PGNs into one file', () => {
    expect(collectionPgn([{ pgn: 'a' }, { pgn: null }, { pgn: 'b' }])).toBe('a\n\nb');
  });
});

describe('clock times in PGN', () => {
  it('writes [%clk] after each move that has a clock, numbering black again after a comment', () => {
    expect(pgnMovetext(['e2e4', 'e7e5', 'g1f3'], START_FEN, '*', [180_000, 179_400, 3_725_900])).toBe(
      '1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:02:59] } 2. Nf3 { [%clk 1:02:05] } *',
    );
    // Unknown clocks are left out.
    expect(pgnMovetext(['e2e4', 'e7e5'], START_FEN, '*', [null, 60_000])).toBe('1. e4 e5 { [%clk 0:01:00] } *');
    expect(pgnMovetext(['e2e4', 'e7e5'], START_FEN, '*')).toBe('1. e4 e5 *');
  });

  it('carries clocks through linePgn', () => {
    expect(linePgn({ moves: ['e2e4'], clocks: [5_000] })).toContain('1. e4 { [%clk 0:00:05] } *');
  });
});
