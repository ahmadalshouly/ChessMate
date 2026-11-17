import { describe, expect, it } from 'vitest';
import {
  Game,
  START_FEN,
  archiveStats,
  detectOpening,
  filterGames,
  fromServerRecord,
  gameToPgn,
  gamesToPgn,
  lookupOpening,
  openingFamilies,
  openingTimeline,
  parsePgn,
  splitPgn,
  viewerOutcome,
  type ArchivedGame,
} from '../src';

const uci = (san: string, fen = START_FEN) => {
  const g = new Game(fen);
  for (const s of san.split(' ')) {
    const m = g.legalMoves().find((x) => x.san === s);
    if (!m) throw new Error(`bad san ${s}`);
    g.move({ from: m.from, to: m.to, promotion: m.promotion as 'q' | undefined });
  }
  return g.uciHistory();
};

function game(over: Partial<ArchivedGame> = {}): ArchivedGame {
  return {
    id: 'g1',
    source: 'online',
    white: 'alice',
    black: 'bob',
    whiteRating: 1500,
    blackRating: 1480,
    whiteDelta: 8,
    blackDelta: -8,
    myColor: 'w',
    timeControl: { initialMs: 300_000, incrementMs: 3000 },
    category: 'blitz',
    rated: true,
    result: '1-0',
    reason: 'resignation',
    initialFen: START_FEN,
    moves: uci('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'),
    startedAt: Date.UTC(2026, 10, 1, 12, 0, 0),
    endedAt: Date.UTC(2026, 10, 1, 12, 10, 0),
    eco: null,
    opening: null,
    ...over,
  };
}

describe('openings', () => {
  it('names the Najdorf', () => {
    const o = detectOpening(uci('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'));
    expect(o?.eco).toBe('B90');
    expect(o?.name).toBe('Sicilian Defense: Najdorf Variation');
    expect(o?.ply).toBe(10);
  });

  it('keeps the last named opening after leaving theory', () => {
    const o = detectOpening(uci('e4 e5 Nf3 Nc6 Bb5 a6 h3 h6 a3 a5'));
    expect(o?.name.startsWith('Ruy Lopez')).toBe(true);
    expect(o!.ply).toBeLessThan(10);
  });

  it('recognises transpositions by position', () => {
    const a = detectOpening(uci('d4 Nf6 c4 e6 Nc3 Bb4'));
    const b = detectOpening(uci('c4 e6 Nc3 Nf6 d4 Bb4'));
    expect(a?.name).toContain('Nimzo-Indian');
    expect(b?.name).toBe(a?.name);
  });

  it('gives a timeline per ply and none for custom starts', () => {
    const t = openingTimeline(uci('e4 e5'));
    expect(t).toHaveLength(3);
    expect(t[0]).toBeNull();
    expect(t[1]?.name).toBe("King's Pawn Game");
    const custom = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1';
    expect(detectOpening(['e2e4'], custom)).toBeNull();
    expect(lookupOpening(new Game().fen)).toBeNull();
  });
});

describe('archive filters', () => {
  const games = [
    game({ id: 'a', endedAt: 3 }),
    game({ id: 'b', myColor: 'b', result: '1-0', category: 'rapid', endedAt: 5, rated: false }),
    game({ id: 'c', result: '1/2-1/2', source: 'practice', myColor: null, endedAt: 4, moves: uci('d4 d5 c4') }),
    game({ id: 'd', source: 'import', myColor: null, result: '0-1', endedAt: 1, white: 'Carlsen', black: 'Nepo' }),
  ].map((g) => fromLocal(g));

  function fromLocal(g: ArchivedGame) {
    const o = detectOpening(g.moves);
    return { ...g, eco: o?.eco ?? null, opening: o?.name ?? null };
  }

  it('sorts newest first', () => {
    expect(filterGames(games).map((g) => g.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('filters by outcome from the viewer side', () => {
    expect(filterGames(games, { outcome: 'win' }).map((g) => g.id)).toEqual(['a']);
    expect(filterGames(games, { outcome: 'loss' }).map((g) => g.id)).toEqual(['b']);
    expect(filterGames(games, { outcome: 'draw' }).map((g) => g.id)).toEqual(['c']);
    expect(viewerOutcome(games[3]!)).toBeNull();
  });

  it('filters by color, category, source, rated, dates and text', () => {
    expect(filterGames(games, { color: 'b' }).map((g) => g.id)).toEqual(['b']);
    expect(filterGames(games, { category: 'rapid' }).map((g) => g.id)).toEqual(['b']);
    expect(filterGames(games, { source: 'import' }).map((g) => g.id)).toEqual(['d']);
    expect(filterGames(games, { rated: false }).map((g) => g.id)).toEqual(['b']);
    expect(filterGames(games, { since: 3, until: 4 }).map((g) => g.id)).toEqual(['c', 'a']);
    expect(filterGames(games, { query: 'carlsen' }).map((g) => g.id)).toEqual(['d']);
    expect(filterGames(games, { query: 'najdorf' }).map((g) => g.id)).toEqual(['b', 'a', 'd']);
    expect(filterGames(games, { openingFamily: "Queen's Gambit" }).map((g) => g.id)).toEqual(['c']);
  });

  it('counts results and opening families', () => {
    expect(archiveStats(games)).toEqual({ total: 4, wins: 1, losses: 1, draws: 1 });
    expect(openingFamilies(games)[0]).toEqual({ family: 'Sicilian Defense', count: 3 });
  });

  it('converts server records from the viewer side', () => {
    const g = fromServerRecord(
      {
        id: 's1', whiteId: 'u1', blackId: 'u2', whiteName: 'alice', blackName: 'bob', whiteRating: 1500, blackRating: 1500,
        whiteDelta: 7, blackDelta: -7, initialMs: 180_000, incrementMs: 2000, category: 'blitz', rated: true,
        result: '0-1', reason: 'checkmate', initialFen: START_FEN, moves: uci('f3 e5 g4 Qh4#'), startedAt: 1, endedAt: 2,
      },
      'u2',
    );
    expect(g.myColor).toBe('b');
    expect(viewerOutcome(g)).toBe('win');
    expect(g.opening).toContain('Barnes Opening');
  });
});

describe('PGN', () => {
  it('exports standard tags and movetext', () => {
    const g = { ...game(), eco: 'B90', opening: 'Sicilian Defense: Najdorf Variation' };
    const pgn = gameToPgn(g);
    expect(pgn).toContain('[White "alice"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[TimeControl "300+3"]');
    expect(pgn).toContain('[WhiteRatingDiff "+8"]');
    expect(pgn).toContain('[UTCDate "2026.11.01"]');
    expect(pgn).toContain('[Termination "normal"]');
    expect(pgn).toContain('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0');
  });

  it('round-trips through import', () => {
    const g = { ...game(), eco: 'B90', opening: 'Sicilian Defense: Najdorf Variation' };
    const { games, errors } = parsePgn(gameToPgn(g), { myNames: ['ALICE'] });
    expect(errors).toEqual([]);
    const back = games[0]!;
    expect(back.moves).toEqual(g.moves);
    expect(back.result).toBe('1-0');
    expect(back.myColor).toBe('w');
    expect(back.whiteRating).toBe(1500);
    expect(back.whiteDelta).toBe(8);
    expect(back.timeControl).toEqual(g.timeControl);
    expect(back.category).toBe('blitz');
    expect(back.endedAt).toBe(g.endedAt);
    expect(back.opening).toBe(g.opening);
    expect(back.rated).toBe(true);
  });

  it('handles custom start positions, black to move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const g = game({ initialFen: fen, moves: uci('e5 Nf3', fen), result: '*', reason: null, opening: null, eco: null });
    const pgn = gameToPgn(g);
    expect(pgn).toContain('[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]');
    expect(pgn).toContain('1... e5 2. Nf3 *');
    const back = parsePgn(pgn).games[0]!;
    expect(back.initialFen).toBe(fen);
    expect(back.moves).toEqual(g.moves);
  });

  it('imports several games with comments and variations, and reports bad ones', () => {
    const text = `﻿[Event "Casual"]\r\n[White "A"]\r\n[Black "B"]\r\n[Result "0-1"]\r\n\r\n1. f3 {weak} e5 2. g4 (2. e4) Qh4# 0-1\r\n\r\n[Event "Rated blitz game"]\n[White "C"]\n[Black "D"]\n[Result "1/2-1/2"]\n[Date "2024.03.??"]\n\n1. e4 e5 $1 2. Nf3 Nc6 1/2-1/2\n\n[White "E"]\n\n1. e4 e5 2. Ke3 Qxx 1-0\n`;
    expect(splitPgn(text)).toHaveLength(3);
    const { games, errors } = parsePgn(text, { now: 42 });
    expect(games).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.index).toBe(2);
    expect(games[0]!.reason).toBe('checkmate');
    expect(games[0]!.endedAt).toBe(42);
    expect(games[0]!.rated).toBe(false);
    expect(games[1]!.rated).toBe(true);
    expect(games[1]!.endedAt).toBe(Date.UTC(2024, 2, 1));
    expect(games[1]!.opening).toContain('Knight');
    expect(games[1]!.tags?.Event).toBe('Rated blitz game');
  });

  it('gives the same id when the same game is imported twice', () => {
    const pgn = gameToPgn(game());
    expect(parsePgn(pgn).games[0]!.id).toBe(parsePgn(pgn).games[0]!.id);
    expect(gamesToPgn([game(), game({ id: 'x' })]).match(/\[Event /g)).toHaveLength(2);
  });
});
