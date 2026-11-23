import { describe, expect, it } from 'vitest';

import { applyGameToStats, awardOpeningsOf, awardProgress, checkmatePatterns, cleanAwardStats, earnedLevels, emptyAwardStats, newlyEarned, type AwardGameFacts } from '../src/awards';

const game = (over: Partial<AwardGameFacts> = {}): AwardGameFacts => ({ result: 'win', openingName: null, category: 'blitz', ratingAfter: null, opponentCountry: null, mateTypes: [], ...over });

describe('checkmate patterns', () => {
  it('back-rank mate', () => {
    expect(checkmatePatterns('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a8')).toEqual(expect.arrayContaining(['backRank', 'rook']));
  });
  it('smothered mate', () => {
    const t = checkmatePatterns('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'g5f7');
    expect(t).toEqual(expect.arrayContaining(['smothered', 'knight']));
    expect(t).not.toContain('backRank');
  });
  it("fool's mate is a quick queen mate", () => {
    expect(checkmatePatterns('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8h4', 4).sort()).toEqual(['queen', 'quick']);
  });
  it('mate by castling', () => {
    expect(checkmatePatterns('4rkr1/4p1p1/8/8/8/8/8/4K2R w K - 0 1', 'e1g1').sort()).toEqual(['castling', 'rook']);
  });
  it('promotion and underpromotion mates', () => {
    expect(checkmatePatterns('k7/2P5/1K6/8/8/8/8/8 w - - 0 1', 'c7c8q').sort()).toEqual(['promotion', 'queen']);
    expect(checkmatePatterns('k7/2P5/1K6/8/8/8/8/8 w - - 0 1', 'c7c8r').sort()).toEqual(['rook', 'underpromotion']);
  });
  it('ignores moves that are not mate', () => {
    expect(checkmatePatterns('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a7')).toEqual([]);
    expect(checkmatePatterns('bad fen', 'a1a8')).toEqual([]);
  });
});

describe('award stats', () => {
  it('maps opening names to awards', () => {
    expect(awardOpeningsOf('Sicilian Defense: Najdorf Variation')).toEqual(['sicilian']);
    expect(awardOpeningsOf("Queen's Pawn Game: London System")).toEqual(['london']);
    expect(awardOpeningsOf("King's Gambit Accepted")).toEqual(['kingsGambit']);
    expect(awardOpeningsOf(null)).toEqual([]);
  });

  it('counts wins, openings, peaks, countries and mates', () => {
    let s = emptyAwardStats();
    s = applyGameToStats(s, game({ openingName: 'Sicilian Defense: Najdorf Variation', ratingAfter: 1510.6, opponentCountry: 'de', mateTypes: ['smothered', 'knight'] }));
    s = applyGameToStats(s, game({ result: 'loss', openingName: 'French Defense', ratingAfter: 1490, opponentCountry: 'FR' }));
    expect(s).toMatchObject({ games: 2, wins: 1, openingWins: { sicilian: 1 }, peaks: { blitz: 1511 }, countries: ['DE', 'FR'], countriesBeaten: ['DE'], mates: 1, mateTypes: { smothered: 1, knight: 1 } });
    expect(s.families).toEqual(['Sicilian Defense', 'French Defense']);
  });

  it('reports newly earned levels once', () => {
    const a = emptyAwardStats();
    const b = applyGameToStats(a, game({ openingName: 'Sicilian Defense', ratingAfter: 1550, mateTypes: ['queen'] }));
    const earned = newlyEarned(a, b).map((e) => `${e.id}:${e.level}`);
    expect(earned).toEqual(expect.arrayContaining(['opening.sicilian:1', 'rating.blitz:1', 'mates.total:1', 'mate.queen:1', 'games.won:1']));
    expect(newlyEarned(b, b)).toEqual([]);
    expect(earnedLevels(b)).toHaveLength(earned.length);
  });

  it('gives progress towards the next level', () => {
    const s = cleanAwardStats({ wins: 60 });
    const won = awardProgress(s).find((p) => p.id === 'games.won')!;
    expect(won).toMatchObject({ level: 2, value: 60, current: 50, next: 250, maxLevel: 5 });
    expect(cleanAwardStats('junk')).toEqual(emptyAwardStats());
  });
});
