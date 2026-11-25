import { describe, expect, it } from 'vitest';

import { Game, START_FEN } from '../src/game';
import { asGameResult, gameToPgn, linePgn, parsePgn } from '../src/pgn';
import { analysisPath, broadcastGamePath, gamePath, gameReviewPath, pathWithQuery, queryString, reviewPath, watchPath } from '../src/share';

const FEN = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1';

describe('share links', () => {
  it('gives server games a short link', () => {
    expect(pathWithQuery(gamePath('abc_123'))).toBe('/game/abc_123');
    expect(pathWithQuery(gameReviewPath('abc_123'))).toBe('/game/abc_123?review=1');
    expect(pathWithQuery(watchPath('g1'))).toBe('/watch/g1');
    expect(pathWithQuery(broadcastGamePath('b/1'))).toBe('/watch/game/b%2F1');
  });

  it('carries the moves for an analysis line, keeping commas readable', () => {
    expect(pathWithQuery(analysisPath({ moves: ['e2e4', 'e7e5'] }))).toBe('/analysis?moves=e2e4,e7e5');
    // The standard start is left out; a custom one is encoded.
    expect(analysisPath({ moves: [], initialFen: START_FEN }).query).toEqual({});
    expect(pathWithQuery(analysisPath({ moves: [], initialFen: FEN }))).toBe(`/analysis?initialFen=${encodeURIComponent(FEN)}`);
    // The ply is only written when it is not the end of the line.
    expect(analysisPath({ moves: ['e2e4', 'e7e5'], ply: 2 }).query).toEqual({ moves: 'e2e4,e7e5' });
    expect(analysisPath({ moves: ['e2e4', 'e7e5'], ply: 1 }).query).toEqual({ moves: 'e2e4,e7e5', ply: '1' });
    expect(analysisPath({ moves: ['e2e4'], ply: 9 }).query).toEqual({ moves: 'e2e4' });
  });

  it('round-trips through URLSearchParams, as the router reads it', () => {
    const p = reviewPath({ moves: ['e2e4', 'e7e5'], initialFen: FEN, white: 'Carlsen, Magnus', black: 'Bob & Co', result: '1-0', orientation: 'b' });
    const read = Object.fromEntries(new URLSearchParams(queryString(p.query!)));
    expect(read).toEqual({ initialFen: FEN, moves: 'e2e4,e7e5', white: 'Carlsen, Magnus', black: 'Bob & Co', result: '1-0', orientation: 'b' });
    // An unfinished result and White's side are the defaults, so they stay out.
    expect(reviewPath({ moves: ['e2e4'], result: '*', orientation: 'w' }).query).toEqual({ moves: 'e2e4' });
  });
});

describe('linePgn', () => {
  it('writes tags and moves for a game the archive does not hold', () => {
    const pgn = linePgn({
      moves: ['e2e4', 'e7e5', 'g1f3'],
      white: 'Alice',
      black: 'Bob',
      whiteRating: 1500,
      result: '*',
      date: Date.UTC(2026, 10, 25, 7, 30),
      tags: { Event: 'ChessMate analysis board' },
    });
    expect(pgn).toContain('[Event "ChessMate analysis board"]');
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[WhiteElo "1500"]');
    expect(pgn).toContain('[Date "2026.11.25"]');
    expect(pgn).toContain('1. e4 e5 2. Nf3 *');
    expect(pgn).not.toContain('BlackElo');
    // Reads back as the same game.
    const back = parsePgn(pgn);
    expect(back.games[0]?.moves).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('keeps a custom start position and fills unknown players', () => {
    const pgn = linePgn({ moves: ['e2e4'], initialFen: FEN });
    expect(pgn).toContain('[Event "?"]');
    expect(pgn).toContain('[White "?"]');
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${FEN}"]`);
    expect(pgn).toContain('1. e4 *');
  });

  it('matches gameToPgn for the same game', () => {
    const moves = Game.fromUciMoves(['d2d4', 'd7d5', 'c2c4']).uciHistory();
    const at = Date.UTC(2026, 0, 2);
    const viaLine = linePgn({ moves, white: 'A', black: 'B', result: '1-0', reason: 'resignation', date: at, tags: { Event: 'ChessMate practice board' } });
    const viaGame = gameToPgn({
      id: 'x',
      source: 'practice',
      white: 'A',
      black: 'B',
      whiteRating: null,
      blackRating: null,
      whiteDelta: null,
      blackDelta: null,
      myColor: null,
      timeControl: null,
      category: null,
      rated: false,
      result: '1-0',
      reason: 'resignation',
      initialFen: START_FEN,
      moves,
      startedAt: at,
      endedAt: at,
      eco: 'D06',
      opening: viaLine.match(/\[Opening "(.+)"\]/)?.[1] ?? null,
    });
    expect(viaLine).toBe(viaGame);
  });

  it('validates result tags', () => {
    expect(asGameResult('1/2-1/2')).toBe('1/2-1/2');
    expect(asGameResult('½-½')).toBeNull();
    expect(asGameResult(undefined)).toBeNull();
  });
});
