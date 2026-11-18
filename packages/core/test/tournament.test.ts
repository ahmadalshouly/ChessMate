import { describe, expect, it } from 'vitest';
import {
  awardPrizes,
  ordinal,
  pairArena,
  pairSwiss,
  prizeTotal,
  rankEntrants,
  resultPoints,
  validatePrizePool,
  validateTournamentSettings,
  type PairingEntrant,
} from '../src/tournament';

const NOW = Date.UTC(2026, 10, 18, 12);

const base = {
  name: 'Friday Blitz Arena',
  description: 'Weekly arena',
  format: 'arena',
  timeControl: { initialMs: 180_000, incrementMs: 2_000 },
  rated: true,
  startsAt: NOW + 3600_000,
  durationMinutes: 60,
};

describe('tournament settings', () => {
  it('accepts a valid arena and normalises it', () => {
    const v = validateTournamentSettings({ ...base, name: '  Friday   Blitz Arena ', prizePool: { currency: 'usd', places: [{ place: 2, amount: 50 }, { place: 1, amount: 100 }] } }, NOW);
    expect('value' in v).toBe(true);
    if (!('value' in v)) return;
    expect(v.value.name).toBe('Friday Blitz Arena');
    expect(v.value.rounds).toBeNull();
    expect(v.value.prizePool?.currency).toBe('USD');
    expect(v.value.prizePool?.places.map((p) => p.place)).toEqual([1, 2]);
    expect(prizeTotal(v.value.prizePool)).toBe(150);
  });

  it('rejects bad input with the field to highlight', () => {
    const err = (raw: Record<string, unknown>) => {
      const v = validateTournamentSettings({ ...base, ...raw }, NOW);
      return 'field' in v ? v.field : null;
    };
    expect(err({ name: 'ab' })).toBe('name');
    expect(err({ startsAt: NOW - 3600_000 })).toBe('startsAt');
    expect(err({ durationMinutes: 5 })).toBe('durationMinutes');
    expect(err({ format: 'swiss', rounds: 0 })).toBe('rounds');
    expect(err({ timeControl: { initialMs: 1000, incrementMs: 0 } })).toBe('timeControl');
    expect(err({ minRating: 1800, maxRating: 1500 })).toBe('minRating');
    expect(err({ maxPlayers: 1 })).toBe('maxPlayers');
    expect(err({ prizePool: { currency: 'dollars', places: [] } })).toBe('prizePool.currency');
  });

  it('checks prize pools', () => {
    expect(validatePrizePool(null)).toEqual({ value: null });
    expect('error' in validatePrizePool({ currency: 'EUR', places: [{ place: 1, amount: 10 }, { place: 1, amount: 5 }] })).toBe(true);
    expect('error' in validatePrizePool({ currency: 'EUR', places: [{ place: 1, amount: 0 }] })).toBe(true);
    const ok = validatePrizePool({ currency: 'EUR', places: [{ place: 1, amount: 0, label: 'Trophy' }] });
    expect('value' in ok && ok.value?.places[0]?.label).toBe('Trophy');
  });
});

describe('scoring', () => {
  it('scores swiss 1 / ½ / 0 and byes', () => {
    expect(resultPoints('swiss', '1-0', 'w', 0).points).toBe(1);
    expect(resultPoints('swiss', '1-0', 'b', 0).points).toBe(0);
    expect(resultPoints('swiss', '1/2-1/2', 'b', 0).points).toBe(0.5);
    expect(resultPoints('swiss', '-+', 'b', 0).points).toBe(1);
    expect(resultPoints('swiss', 'bye', 'w', 0).points).toBe(1);
  });

  it('doubles arena points after two wins in a row', () => {
    let streak = 0;
    const pts: number[] = [];
    for (const r of ['1-0', '1-0', '1-0', '1/2-1/2', '1-0'] as const) {
      const p = resultPoints('arena', r, 'w', streak);
      pts.push(p.points);
      streak = p.streak;
    }
    expect(pts).toEqual([2, 2, 4, 2, 2]);
    expect(resultPoints('arena', '0-1', 'w', 5)).toMatchObject({ points: 0, streak: 0 });
  });
});

const entrant = (id: string, score: number, rating: number, opponents: string[] = [], colorBalance = 0, hadBye = false): PairingEntrant => ({ id, score, rating, opponents, colorBalance, hadBye });

describe('swiss pairing', () => {
  it('pairs by score and gives the lowest seed the bye', () => {
    const r = pairSwiss([entrant('a', 0, 2000), entrant('b', 0, 1900), entrant('c', 0, 1800), entrant('d', 0, 1700), entrant('e', 0, 1600)], 1);
    expect(r.bye).toBe('e');
    expect(r.pairs).toHaveLength(2);
    const flat = r.pairs.flat().sort();
    expect(flat).toEqual(['a', 'b', 'c', 'd']);
  });

  it('avoids rematches by backtracking', () => {
    // a-b and c-d met in round 1; round 2 must pair a-c/b-d or a-d/b-c.
    const r = pairSwiss([entrant('a', 1, 2000, ['b']), entrant('b', 0, 1900, ['a']), entrant('c', 1, 1800, ['d']), entrant('d', 0, 1700, ['c'])], 2);
    for (const [w, b] of r.pairs) expect([w, b].sort().join()).not.toMatch(/^(a,b|c,d)$/);
  });

  it('never gives a second bye while someone has not had one', () => {
    const r = pairSwiss([entrant('a', 2, 2000), entrant('b', 1, 1900), entrant('c', 0, 1800, [], 0, true)], 3);
    expect(r.bye).toBe('b');
  });

  it('balances colours', () => {
    const r = pairSwiss([entrant('a', 1, 2000, ['x'], 1), entrant('b', 1, 1900, ['y'], -1)], 2);
    expect(r.pairs[0]).toEqual(['b', 'a']);
  });

  it('still pairs everyone when only rematches are left', () => {
    const r = pairSwiss([entrant('a', 1, 2000, ['b']), entrant('b', 1, 1900, ['a'])], 2);
    expect(r.pairs).toHaveLength(1);
  });
});

describe('arena pairing', () => {
  it('pairs neighbours and skips an immediate rematch when others wait', () => {
    const r = pairArena([entrant('a', 4, 2000, ['b']), entrant('b', 4, 1990, ['a']), entrant('c', 2, 1500), entrant('d', 0, 1400)]);
    expect(r.pairs).toHaveLength(2);
    for (const [w, b] of r.pairs) expect([w, b].sort().join()).not.toBe('a,b');
  });

  it('allows a rematch when only those two are waiting', () => {
    expect(pairArena([entrant('a', 2, 2000, ['b']), entrant('b', 0, 1990, ['a'])]).pairs).toHaveLength(1);
  });

  it('leaves the odd player waiting', () => {
    const r = pairArena([entrant('a', 0, 1500), entrant('b', 0, 1500), entrant('c', 0, 1500)]);
    expect(r.pairs).toHaveLength(1);
  });
});

describe('standings and prizes', () => {
  it('splits swiss ties by Buchholz and assigns prizes to players who played', () => {
    const rows = rankEntrants('swiss', [
      { userId: 'a', score: 2, rating: 1500, wins: 2, opponents: ['c', 'd'], status: 'active' as const, games: 2 },
      { userId: 'b', score: 2, rating: 1600, wins: 2, opponents: ['d', 'e'], status: 'active' as const, games: 2 },
      { userId: 'c', score: 1, rating: 1500, wins: 1, opponents: ['a'], status: 'active' as const, games: 1 },
      { userId: 'd', score: 0, rating: 1500, wins: 0, opponents: ['b', 'a'], status: 'active' as const, games: 2 },
      { userId: 'e', score: 0, rating: 1500, wins: 0, opponents: ['b'], status: 'active' as const, games: 1 },
      { userId: 'x', score: 3, rating: 1500, wins: 3, opponents: [], status: 'removed' as const, games: 3 },
    ]);
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b', 'c', 'd', 'e', 'x']);
    const prizes = awardPrizes(rows, { currency: 'USD', places: [{ place: 1, amount: 100, label: null }, { place: 2, amount: 50, label: null }], note: null });
    expect(prizes.get('a')?.amount).toBe(100);
    expect(prizes.get('b')?.place).toBe(2);
    expect(prizes.has('x')).toBe(false);
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });
});
