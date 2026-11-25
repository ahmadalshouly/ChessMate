import { describe, expect, it } from 'vitest';

import {
  Game,
  START_FEN,
  bookTimeline,
  buildReview,
  explorerCacheKey,
  explorerKey,
  explorerShares,
  explorerTallies,
  explorerWhiteScore,
  formatGameCount,
  isTheoryMove,
  movePlayedShare,
  parseExplorerFilters,
  parseLichessExplorer,
  theoryPlies,
  type ExplorerPosition,
  type PositionEval,
} from '../src';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('explorer numbers', () => {
  it('shortens game counts like the explorer column', () => {
    expect(formatGameCount(0)).toBe('0');
    expect(formatGameCount(812)).toBe('812');
    expect(formatGameCount(4_400)).toBe('4.4K');
    expect(formatGameCount(19_900_000)).toBe('19.9M');
    expect(formatGameCount(185_000_000)).toBe('185M');
    expect(formatGameCount(1_234_000_000)).toBe('1.2B');
    expect(formatGameCount(999_960)).toBe('1M');
    expect(formatGameCount(2_000)).toBe('2K');
  });

  it('splits results into whole percents that add up to 100', () => {
    expect(explorerShares({ white: 1, draws: 1, black: 1 })).toEqual({ white: 34, draws: 33, black: 33 });
    expect(explorerShares({ white: 48, draws: 7, black: 45 })).toEqual({ white: 48, draws: 7, black: 45 });
    expect(explorerShares({ white: 0, draws: 0, black: 0 })).toEqual({ white: 0, draws: 0, black: 0 });
    const s = explorerShares({ white: 2, draws: 1, black: 4 });
    expect(s.white + s.draws + s.black).toBe(100);
  });

  it('gives the share each move was played and the score for White', () => {
    const pos = { white: 50, draws: 10, black: 40, moves: [{ white: 30, draws: 5, black: 15 }, { white: 20, draws: 5, black: 25 }] };
    expect(movePlayedShare(pos, pos.moves[0]!)).toBe(50);
    expect(explorerWhiteScore({ white: 3, draws: 2, black: 5 })).toBeCloseTo(0.4);
    expect(explorerWhiteScore({ white: 0, draws: 0, black: 0 })).toBeNull();
  });
});

describe('explorer keys and filters', () => {
  it('ignores move counters, so move order to a position does not matter', () => {
    expect(explorerKey(AFTER_E4)).toBe(explorerKey(AFTER_E4.replace('0 1', '3 9')));
    expect(explorerKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('keeps known filter values in a fixed order', () => {
    expect(parseExplorerFilters('rapid,blitz,blitz,hyper', '2500,1600,1234')).toEqual({ speeds: ['blitz', 'rapid'], ratings: [1600, 2500] });
    expect(parseExplorerFilters(null, undefined)).toEqual({ speeds: [], ratings: [] });
  });

  it('keys the cache by filters only for the Lichess collection', () => {
    const a = explorerCacheKey('lichess', START_FEN, { speeds: ['rapid', 'blitz'] });
    const b = explorerCacheKey('lichess', START_FEN, { speeds: ['blitz', 'rapid'] });
    expect(a).toBe(b);
    expect(a).not.toBe(explorerCacheKey('lichess', START_FEN, { speeds: ['blitz'] }));
    expect(explorerCacheKey('masters', START_FEN, { speeds: ['blitz'] })).toBe(explorerCacheKey('masters', START_FEN));
  });
});

describe('parseLichessExplorer', () => {
  it('reads an answer, names moves by our SAN and UCI, and drops illegal ones', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3';
    const p = parseLichessExplorer(fen, 'masters', {
      white: 100,
      draws: 80,
      black: 60,
      moves: [
        { uci: 'e1h1', san: 'O-O', white: 50, draws: 40, black: 30, averageRating: 2450.4 },
        { uci: 'd2d3', san: 'd3', white: 5, draws: 5, black: 5, averageRating: 2400 },
        { uci: 'a1a8', san: 'Rxa8', white: 1, draws: 0, black: 0, averageRating: 2400 },
        { uci: 'b1c3', san: 'Nc3', white: 30, draws: 20, black: 20, averageRating: null },
      ],
      opening: { eco: 'C60', name: 'Ruy Lopez' },
      topGames: [],
    })!;
    expect(p.source).toBe('masters');
    expect(p.moves.map((m) => [m.san, m.uci])).toEqual([
      ['O-O', 'e1g1'],
      ['Nc3', 'b1c3'],
      ['d3', 'd2d3'],
    ]);
    expect(p.moves[0]!.averageRating).toBe(2450);
    expect(p.moves[1]!.averageRating).toBeNull();
    expect(p.opening).toEqual({ eco: 'C60', name: 'Ruy Lopez' });
    expect([p.white, p.draws, p.black]).toEqual([100, 80, 60]);
  });

  it('falls back to our own opening names and rejects non-answers', () => {
    const p = parseLichessExplorer(AFTER_E4, 'lichess', { white: 1, draws: 0, black: 0, moves: [], opening: null })!;
    expect(p.opening?.name).toBeTruthy();
    expect(parseLichessExplorer(AFTER_E4, 'lichess', { error: 'nope' })).toBeNull();
    expect(parseLichessExplorer('not a fen', 'lichess', { moves: [] })).toBeNull();
  });
});

/** A tiny masters database: per position key, games per move. */
function masters(table: Record<string, Record<string, number>>) {
  return async (fen: string): Promise<ExplorerPosition | null> => {
    const key = explorerKey(fen);
    const moves = table[key];
    if (!moves) return null;
    const g = new Game(fen);
    return {
      source: 'masters',
      key,
      white: 0,
      draws: Object.values(moves).reduce((a, b) => a + b, 0),
      black: 0,
      opening: null,
      moves: Object.entries(moves).map(([uci, n]) => {
        const san = g.legalMoves().find((m) => `${m.from}${m.to}${m.promotion ?? ''}` === uci)!.san;
        return { uci, san, white: 0, draws: n, black: 0, averageRating: 2400 };
      }),
    };
  };
}

describe('theory from the masters games', () => {
  const after = (...moves: string[]) => explorerKey(Game.fromUciMoves(moves, START_FEN).fen);
  const db = masters({
    [explorerKey(START_FEN)]: { e2e4: 5000, d2d4: 4000, a2a3: 9, g1f3: 30 },
    [after('e2e4')]: { e7e5: 2000, c7c5: 2500, b7b6: 60, g7g5: 12 },
    [after('e2e4', 'c7c5')]: { g1f3: 2000, b1c3: 300 },
  });

  it('needs enough games and a big enough share', () => {
    const pos = { source: 'masters' as const, key: '', white: 0, draws: 0, black: 0, opening: null, moves: [] };
    const withMoves = (n: number, total: number) => ({ ...pos, draws: total, moves: [{ uci: 'e2e4', san: 'e4', white: 0, draws: n, black: 0, averageRating: null }] });
    expect(isTheoryMove(withMoves(10, 1000), 'e2e4')).toBe(true);
    expect(isTheoryMove(withMoves(9, 100), 'e2e4')).toBe(false); // too few games
    expect(isTheoryMove(withMoves(10, 1001), 'e2e4')).toBe(false); // under 1%
    expect(isTheoryMove(withMoves(50, 100), 'd2d4')).toBe(false); // never played
  });

  it('counts opening moves while each one is theory', async () => {
    expect(await theoryPlies(['e2e4', 'c7c5', 'g1f3', 'd7d6'], db)).toBe(3);
    // 1. a3 was played 9 times: not theory.
    expect(await theoryPlies(['a2a3', 'e7e5'], db)).toBe(0);
    // 1. e4 b6 is rare but past both bars (60 of 4572 games); 1. e4 g5 is not (12 games, 0.3%).
    expect(await theoryPlies(['e2e4', 'b7b6'], db)).toBe(2);
    expect(await theoryPlies(['e2e4', 'g7g5'], db)).toBe(1);
  });

  it('has none from a custom start', async () => {
    expect(await theoryPlies(['e2e3'], db, '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')).toBe(0);
  });

  it('turns more opening moves into Book in a review, but not a mistake', () => {
    const ev = (cp: number, best: string): PositionEval => ({ score: { cp }, bestMove: best, pv: [best], depth: 12 });
    // 1. e4 c5 2. Nf3 d6 3. Bb5+: masters theory says 5 plies.
    const moves = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'f1b5'];
    const evals = [ev(30, 'e2e4'), ev(30, 'c7c5'), ev(30, 'g1f3'), ev(30, 'd7d6'), ev(30, 'd2d4'), ev(30, 'c8d7')];
    const named = bookTimeline(moves).filter(Boolean).length;
    const plain = buildReview(START_FEN, moves, evals);
    const deep = buildReview(START_FEN, moves, evals, null, { theoryPlies: 5 });
    expect(deep.moves.every((m) => m.judgement.classification === 'book')).toBe(true);
    expect(plain.moves.filter((m) => m.judgement.classification === 'book').length).toBe(named);
    // A theory move the engine calls a mistake is graded as one, and theory ends there.
    const bad = buildReview(START_FEN, moves, [...evals.slice(0, 4), ev(300, 'd2d4'), ev(300, 'c8d7')], null, { theoryPlies: 5 });
    expect(bad.moves.slice(0, 3).every((m) => m.judgement.classification === 'book')).toBe(true);
    expect(bad.moves[3]!.judgement.classification).not.toBe('book');
    expect(bad.moves[4]!.judgement.classification).not.toBe('book');
  });
});

describe('ChessMate game tallies', () => {
  it('records the position before each move with its SAN', () => {
    const t = explorerTallies(['e2e4', 'e7e5', 'g1f3']);
    expect(t.map((x) => x.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(t[0]!.key).toBe(explorerKey(START_FEN));
    expect(t[1]!.key).toBe(explorerKey(AFTER_E4));
  });

  it('stops after the opening and skips custom starts and broken games', () => {
    const long = Array.from({ length: 20 }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat();
    expect(explorerTallies(long)).toHaveLength(30);
    expect(explorerTallies(['e2e4'], '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')).toEqual([]);
    expect(explorerTallies(['e2e4', 'e2e4'])).toEqual([]);
  });
});
