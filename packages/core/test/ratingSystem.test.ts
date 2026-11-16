import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATING,
  LEADERBOARD_MIN_GAMES,
  MAX_RD,
  PROVISIONAL_RD,
  RATING_FLOOR,
  applyResult,
  currentRating,
  dailyRatingChart,
  decayRd,
  expectedOutcome,
  formatRating,
  formatRatingDelta,
  historyEntry,
  isOnLeaderboard,
  isProvisionalRating,
  matchmakingGap,
  newCategoryRating,
  parseTimeControl,
  ratePuzzleAttempt,
  rateGame,
  ratingCategoryOf,
  ratingInterval,
  ratingProgress,
  ratingStakes,
  resolveRatingRange,
  sanitizeRatingRange,
  unratedReason,
  updateRating,
  type CategoryRating,
  type RatedGameCheck,
} from '../src';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

function established(rating: number, rd = 60, extra: Partial<CategoryRating> = {}): CategoryRating {
  return { ...newCategoryRating(), rating, rd, games: 100, peak: rating, lastRatedAt: T0, ...extra };
}

describe('Glicko-2 core', () => {
  it('matches the worked example from Glickman (2012)', () => {
    const r = updateRating({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
    ]);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    expect(r.volatility).toBeCloseTo(0.05999, 4);
  });

  it('expected outcome is symmetric and 0.5 for equal players', () => {
    const a = established(1600);
    const b = established(1400);
    expect(expectedOutcome(a, a)).toBeCloseTo(0.5, 10);
    expect(expectedOutcome(a, b) + expectedOutcome(b, a)).toBeCloseTo(1, 10);
    expect(expectedOutcome(a, b)).toBeGreaterThan(0.7);
  });
});

describe('categories', () => {
  it('maps time controls to separate rating pools', () => {
    expect(ratingCategoryOf(parseTimeControl('1+0'))).toBe('bullet');
    expect(ratingCategoryOf(parseTimeControl('3+2'))).toBe('blitz');
    expect(ratingCategoryOf(parseTimeControl('10+5'))).toBe('rapid');
    expect(ratingCategoryOf(parseTimeControl('30+20'))).toBe('classical');
  });
});

describe('provisional ratings', () => {
  it('new players start at 1500 with RD 350 and are provisional', () => {
    const r = newCategoryRating();
    expect(r).toMatchObject({ rating: 1500, rd: 350, games: 0, peak: null, lastRatedAt: null });
    expect(isProvisionalRating(r)).toBe(true);
    expect(formatRating(r)).toBe('1500?');
  });

  it('new players move fast, established players move slowly', () => {
    const opp = established(1500);
    const fresh = applyResult('blitz', newCategoryRating(), opp, 1, T0);
    const vet = applyResult('blitz', established(1500), opp, 1, T0);
    expect(fresh.delta).toBeGreaterThan(100);
    expect(vet.delta).toBeGreaterThan(0);
    expect(vet.delta).toBeLessThan(15);
  });

  it('leaves provisional status after roughly a dozen games', () => {
    let r = newCategoryRating();
    let games = 0;
    while (isProvisionalRating(r) && games < 50) {
      const opp = established(1500);
      r = applyResult('blitz', r, opp, (games % 2) as 0 | 1, T0 + games * 60_000).after;
      games++;
    }
    expect(games).toBeGreaterThan(5);
    expect(games).toBeLessThan(25);
    expect(r.rd).toBeLessThanOrEqual(PROVISIONAL_RD);
  });

  it('beating a provisional opponent counts for less than beating an established one', () => {
    const me = established(1500);
    const vsEstablished = applyResult('blitz', me, established(1500), 1, T0).delta;
    const vsNew = applyResult('blitz', me, newCategoryRating(), 1, T0).delta;
    expect(vsNew).toBeLessThan(vsEstablished);
  });

  it('peak is only tracked once the rating is established', () => {
    const r = applyResult('blitz', newCategoryRating(), established(1500), 1, T0).after;
    expect(r.peak).toBeNull();
    const e = applyResult('blitz', established(1500, 60, { peak: 1700 }), established(1500), 1, T0).after;
    expect(e.peak).toBe(1700);
    const up = applyResult('blitz', established(1800, 60, { peak: 1700 }), established(1800), 1, T0).after;
    expect(up.peak).toBeCloseTo(up.rating, 6);
  });
});

describe('inactivity decay', () => {
  it('increases RD with time and caps at the maximum', () => {
    const r = established(1800, 50);
    expect(decayRd(r, T0, T0).rd).toBe(50);
    const month = decayRd(r, T0, T0 + 30 * DAY).rd;
    const year = decayRd(r, T0, T0 + 365 * DAY).rd;
    expect(month).toBeGreaterThan(50);
    expect(year).toBeGreaterThan(month);
    expect(decayRd(r, T0, T0 + 100 * 365 * DAY).rd).toBe(MAX_RD);
    expect(decayRd(r, null, T0 + 365 * DAY).rd).toBe(50);
  });

  it('keeps the rating number itself unchanged', () => {
    const r = currentRating(established(1800, 50), T0 + 200 * DAY);
    expect(r.rating).toBe(1800);
  });

  it('a returning player re-converges faster than an active one', () => {
    const opp = established(1800, 50, { lastRatedAt: T0 + 400 * DAY });
    const active = applyResult('blitz', established(1800, 50, { lastRatedAt: T0 + 399 * DAY }), opp, 1, T0 + 400 * DAY);
    const returning = applyResult('blitz', established(1800, 50), opp, 1, T0 + 400 * DAY);
    expect(returning.delta).toBeGreaterThan(active.delta);
  });
});

describe('rateGame', () => {
  it('is zero-sum-ish for equal established players and counts W/L/D', () => {
    const { w, b } = rateGame('blitz', established(1500), established(1500), 'w', T0);
    expect(w.delta).toBeGreaterThan(0);
    expect(w.delta).toBe(-b.delta);
    expect(w.after).toMatchObject({ games: 101, wins: 1, losses: 0, draws: 0, lastRatedAt: T0 });
    expect(b.after).toMatchObject({ games: 101, wins: 0, losses: 1, draws: 0 });
  });

  it('a draw moves the stronger player down and the weaker up', () => {
    const { w, b } = rateGame('rapid', established(2000), established(1600), null, T0);
    expect(w.delta).toBeLessThan(0);
    expect(b.delta).toBeGreaterThan(0);
    expect(w.after.draws).toBe(1);
  });

  it('upsets move ratings more than expected wins', () => {
    const upset = rateGame('blitz', established(1400), established(1800), 'w', T0).w.delta;
    const expected = rateGame('blitz', established(1800), established(1400), 'w', T0).w.delta;
    expect(upset).toBeGreaterThan(expected * 3);
  });

  it('never drops below the rating floor', () => {
    let r = established(RATING_FLOOR + 5, 200);
    for (let i = 0; i < 20; i++) r = applyResult('bullet', r, established(RATING_FLOOR), 0, T0 + i).after;
    expect(r.rating).toBe(RATING_FLOOR);
  });

  it('stakes preview matches what actually happens', () => {
    const me = established(1500, 80);
    const opp = established(1650, 80);
    const s = ratingStakes(me, opp, 'blitz', T0);
    expect(s.win).toBeGreaterThan(0);
    expect(s.loss).toBeLessThan(0);
    expect(s.draw).toBeGreaterThan(0);
    expect(rateGame('blitz', me, opp, 'w', T0).w.delta).toBe(s.win);
  });

  it('over many games ratings converge to true strength ordering', () => {
    // Deterministic pseudo-random results from known true strengths.
    const truth = [1200, 1500, 1800];
    const rs = truth.map(() => newCategoryRating());
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 600; i++) {
      const a = i % 3;
      const b = (i + 1 + (i % 2)) % 3;
      if (a === b) continue;
      const pA = 1 / (1 + 10 ** ((truth[b]! - truth[a]!) / 400));
      const winner = rand() < pA ? 'w' : 'b';
      const res = rateGame('blitz', rs[a]!, rs[b]!, winner, T0 + i * 60_000);
      rs[a] = res.w.after;
      rs[b] = res.b.after;
    }
    expect(rs[0]!.rating).toBeLessThan(rs[1]!.rating);
    expect(rs[1]!.rating).toBeLessThan(rs[2]!.rating);
    expect(rs[2]!.rating - rs[0]!.rating).toBeGreaterThan(400);
    for (const r of rs) expect(isProvisionalRating(r)).toBe(false);
  });
});

describe('rated vs casual', () => {
  const base: RatedGameCheck = {
    rated: true,
    whiteId: 'a',
    blackId: 'b',
    whiteIsGuest: false,
    blackIsGuest: false,
    timeControl: parseTimeControl('3+2'),
    reason: 'checkmate',
    winner: 'w',
    plies: 30,
  };
  it('rates normal finished games', () => expect(unratedReason(base)).toBeNull());
  it('skips casual games', () => expect(unratedReason({ ...base, rated: false })).toBe('casual'));
  it('skips guests', () => expect(unratedReason({ ...base, blackIsGuest: true })).toBe('guest'));
  it('skips self-play', () => expect(unratedReason({ ...base, blackId: 'a' })).toBe('same_player'));
  it('skips aborted games', () => expect(unratedReason({ ...base, reason: 'aborted' })).toBe('aborted'));
  it('skips games without moves from both sides', () =>
    expect(unratedReason({ ...base, reason: 'resignation', plies: 1 })).toBe('too_short'));
  it('rates draws and timeouts', () => {
    expect(unratedReason({ ...base, reason: 'draw_agreement', winner: null })).toBeNull();
    expect(unratedReason({ ...base, reason: 'timeout', winner: 'b' })).toBeNull();
  });
});

describe('puzzles', () => {
  it('solving raises player rating and lowers puzzle rating', () => {
    const puzzle = { rating: 1600, rd: 80, volatility: 0.06 };
    const res = ratePuzzleAttempt(established(1500, 80), puzzle, true, T0);
    expect(res.player.category).toBe('puzzle');
    expect(res.player.delta).toBeGreaterThan(0);
    expect(res.puzzle.rating).toBeLessThan(1600);
    const fail = ratePuzzleAttempt(established(1500, 80), puzzle, false, T0);
    expect(fail.player.delta).toBeLessThan(0);
    expect(fail.puzzle.rating).toBeGreaterThan(1600);
  });
});

describe('history', () => {
  it('builds entries and a daily chart with the closing rating per day', () => {
    const ch = (before: number, after: number) =>
      ({ category: 'blitz', before: established(before), after: established(after), delta: after - before }) as const;
    const entries = [
      historyEntry('u', 'g1', 'o', 1500, 1, ch(1500, 1510), T0 + 1000),
      historyEntry('u', 'g2', 'o', 1500, 1, ch(1510, 1520), T0 + 2000),
      historyEntry('u', 'g3', 'o', 1500, 0, ch(1520, 1505), T0 + DAY + 5),
    ];
    expect(entries[0]).toMatchObject({ userId: 'u', sourceId: 'g1', ratingBefore: 1500, ratingAfter: 1510, delta: 10 });
    expect(dailyRatingChart(entries)).toEqual([
      { day: T0, rating: 1520 },
      { day: T0 + DAY, rating: 1505 },
    ]);
    expect(ratingProgress(entries, T0 + 2 * DAY)).toBe(5);
    expect(ratingProgress(entries, T0 + 100 * DAY)).toBe(0);
  });
});

describe('leaderboard eligibility', () => {
  it('needs enough games, recent activity and a non-provisional rating', () => {
    const r = established(2000, 60, { games: LEADERBOARD_MIN_GAMES });
    expect(isOnLeaderboard(r, T0 + DAY)).toBe(true);
    expect(isOnLeaderboard({ ...r, games: LEADERBOARD_MIN_GAMES - 1 }, T0 + DAY)).toBe(false);
    expect(isOnLeaderboard(r, T0 + 60 * DAY)).toBe(false);
    expect(isOnLeaderboard({ ...r, rd: 200 }, T0 + DAY)).toBe(false);
  });
});

describe('matchmaking range', () => {
  it('widens for provisional players and with waiting, up to a cap', () => {
    const est = matchmakingGap({ rd: 60 }, 0);
    const prov = matchmakingGap({ rd: DEFAULT_RATING.rd }, 0);
    expect(est).toBe(100);
    expect(prov).toBeGreaterThan(est);
    expect(matchmakingGap({ rd: 60 }, 10_000)).toBe(300);
    expect(matchmakingGap({ rd: 60 }, 600_000)).toBe(800);
  });

  it('resolves relative preferences and sanitises client ranges', () => {
    expect(resolveRatingRange(1500, { below: 200, above: 300 })).toEqual([1300, 1800]);
    expect(resolveRatingRange(150, { below: 500, above: -5 })).toEqual([RATING_FLOOR, 150]);
    expect(sanitizeRatingRange([1600, 1800], 1500)).toEqual([1500, 1800]);
    expect(sanitizeRatingRange([1800, 1600], 1500)).toBeNull();
    expect(sanitizeRatingRange('x', 1500)).toBeNull();
    expect(sanitizeRatingRange([NaN, 3], 1500)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats ratings, deltas and intervals', () => {
    expect(formatRating(established(1534.6))).toBe('1535');
    expect(formatRatingDelta(7.6)).toBe('+8');
    expect(formatRatingDelta(-3)).toBe('-3');
    expect(formatRatingDelta(0.2)).toBe('±0');
    expect(ratingInterval({ rating: 1500, rd: 50 })).toEqual([1400, 1600]);
  });
});
