import { describe, expect, it } from 'vitest';

import { arenaPoints, nextRun, swissPairings, tournamentSettings, DEFAULT_TOURNAMENT_SETTINGS, formatMoney, profilePath, qrMatrix, qrPath, usernameFromLink, validatePayoutRequest, validateSponsorApplication, validateTournamentInput } from '../src';

describe('arena points', () => {
  const run = (wins = 0, draws = 0, losses = 0) => ({ wins, draws, losses });
  const all = { winStreak: true, drawStreak: true, lossStreak: true, frenzy: true };
  const none = { winStreak: false, drawStreak: false, lossStreak: false, frenzy: false };
  it('scores win 2, draw 1, loss 0 without streak options', () => {
    expect(arenaPoints('win', run(5), none)).toBe(2);
    expect(arenaPoints('draw', run(0, 5), none)).toBe(1);
    expect(arenaPoints('loss', run(0, 0, 5), none)).toBe(0);
  });
  it('applies each streak after two in a row', () => {
    expect(arenaPoints('win', run(1), all)).toBe(2);
    expect(arenaPoints('win', run(2), all)).toBe(4);
    expect(arenaPoints('draw', run(0, 1), all)).toBe(1);
    expect(arenaPoints('draw', run(0, 2), all)).toBe(0);
    expect(arenaPoints('loss', run(0, 0, 1), all)).toBe(0);
    expect(arenaPoints('loss', run(0, 0, 2), all)).toBe(-1);
  });
  it('adds a frenzy point to a win or draw that scored', () => {
    expect(arenaPoints('win', run(), all, true)).toBe(3);
    expect(arenaPoints('win', run(2), all, true)).toBe(5);
    expect(arenaPoints('draw', run(), all, true)).toBe(2);
    expect(arenaPoints('draw', run(0, 2), all, true)).toBe(0);
    expect(arenaPoints('loss', run(), all, true)).toBe(0);
    expect(arenaPoints('win', run(), { ...all, frenzy: false }, true)).toBe(2);
  });
  it('tracks runs of the same result', () => {
    expect(nextRun(run(2), 'win')).toEqual(run(3));
    expect(nextRun(run(2), 'draw')).toEqual(run(0, 1));
    expect(nextRun(run(0, 0, 1), 'loss')).toEqual(run(0, 0, 2));
  });
  it('fills missing settings with the defaults', () => {
    expect(tournamentSettings(null)).toEqual(DEFAULT_TOURNAMENT_SETTINGS);
    expect(tournamentSettings({ format: 'swiss', rounds: 99 })).toMatchObject({ format: 'swiss', rounds: 15 });
  });
});

describe('swiss pairings', () => {
  const p = (id: string, score: number, rating: number, opponents: string[] = [], colors: ('w' | 'b')[] = [], byes = 0) => ({ id, score, rating, opponents, colors, byes });
  it('pairs neighbours and gives the lowest player the bye', () => {
    const r = swissPairings([p('a', 0, 2000), p('b', 0, 1900), p('c', 0, 1800), p('d', 0, 1700), p('e', 0, 1600)]);
    expect(r.bye).toBe('e');
    expect(r.pairs.map((x) => [...x].sort().join(''))).toEqual(['ab', 'cd']);
  });
  it('avoids rematches and repeated byes', () => {
    const r = swissPairings([p('a', 2, 2000, ['b'], ['w']), p('b', 0, 1900, ['a'], ['b']), p('c', 2, 1800, ['d'], ['w']), p('d', 0, 1700, ['c'], ['b'])]);
    const keys = r.pairs.map((x) => [...x].sort().join(''));
    expect(keys).toEqual(['ac', 'bd']);
    const r2 = swissPairings([p('a', 2, 2000), p('b', 2, 1900), p('c', 2, 1800, [], [], 1)]);
    expect(r2.bye).toBe('b');
  });
  it('balances colours', () => {
    const r = swissPairings([p('a', 2, 2000, ['x'], ['w']), p('b', 2, 1900, ['y'], ['b'])]);
    expect(r.pairs[0]).toEqual(['b', 'a']);
  });
  it('falls back to a rematch when nothing else works', () => {
    const r = swissPairings([p('a', 2, 2000, ['b']), p('b', 0, 1900, ['a'])]);
    expect(r.pairs).toHaveLength(1);
  });
});

describe('tournament input', () => {
  const now = Date.UTC(2026, 10, 19, 12);
  const ok = { name: 'Friday Blitz', timeControl: { initialMs: 180_000, incrementMs: 2000 }, startsAt: now + 3600_000, durationMinutes: 60, prizes: [{ place: 2, prize: '$50' }, { place: 1, prize: '$100' }] };
  it('accepts a valid tournament and sorts prizes', () => {
    const r = validateTournamentInput(ok, now);
    expect('value' in r && r.value.prizes.map((p) => p.place)).toEqual([1, 2]);
    expect('value' in r && r.value.rated).toBe(true);
  });
  it('rejects bad input', () => {
    expect(validateTournamentInput({ ...ok, name: 'x' }, now)).toMatchObject({ field: 'name' });
    expect(validateTournamentInput({ ...ok, startsAt: now - 3600_000 }, now)).toMatchObject({ field: 'startsAt' });
    expect(validateTournamentInput({ ...ok, durationMinutes: 2 }, now)).toMatchObject({ field: 'durationMinutes' });
    expect(validateTournamentInput({ ...ok, prizes: [{ place: 1, prize: 'a' }, { place: 1, prize: 'b' }] }, now)).toMatchObject({ field: 'prizes' });
  });
  it('fills missing fields from the current tournament when editing', () => {
    const base = validateTournamentInput(ok, now);
    if (!('value' in base)) throw new Error('expected a value');
    const edit = validateTournamentInput({ prizePool: '$150' }, now + 7200_000, base.value);
    expect('value' in edit && edit.value.prizePool).toBe('$150');
    expect('value' in edit && edit.value.name).toBe('Friday Blitz');
  });
});

describe('tournament fees, ratings and sponsors', () => {
  const now = Date.UTC(2026, 10, 19, 12);
  const base = { name: 'Sponsored Rapid', timeControl: { initialMs: 600_000, incrementMs: 0 }, startsAt: now + 3600_000, durationMinutes: 90 };
  it('accepts fees, rating limits and a sponsor', () => {
    const r = validateTournamentInput({ ...base, entryFeeCents: 500, currency: 'usd', minRating: 1200, maxRating: 1800, minRatedGames: 10, lateJoin: false, rules: 'No pre-arranged draws', sponsorName: 'Acme', sponsorUrl: 'https://acme.example', sponsorLogo: 'data:image/png;base64,iVBORw0KGgo=' }, now);
    expect('value' in r && r.value).toMatchObject({ entryFeeCents: 500, currency: 'usd', minRating: 1200, maxRating: 1800, minRatedGames: 10, lateJoin: false, sponsorName: 'Acme' });
    expect('value' in r && r.value.sponsorLogo).toMatch(/^data:image\/png/);
  });
  it('defaults to a free tournament without limits', () => {
    const r = validateTournamentInput(base, now);
    expect('value' in r && r.value).toMatchObject({ entryFeeCents: 0, currency: 'eur', minRating: null, maxRating: null, lateJoin: true, sponsorName: null });
    expect('value' in r && 'sponsorLogo' in r.value).toBe(false);
  });
  it('rejects bad fees, ratings and logos', () => {
    expect(validateTournamentInput({ ...base, entryFeeCents: 50 }, now)).toMatchObject({ field: 'entryFeeCents' });
    expect(validateTournamentInput({ ...base, currency: 'btc' }, now)).toMatchObject({ field: 'currency' });
    expect(validateTournamentInput({ ...base, minRating: 2000, maxRating: 1500 }, now)).toMatchObject({ field: 'minRating' });
    expect(validateTournamentInput({ ...base, sponsorName: 'X', sponsorLogo: 'data:image/svg+xml;base64,PHN2Zz4=' }, now)).toMatchObject({ field: 'sponsorLogo' });
    expect(validateTournamentInput({ ...base, sponsorLogo: 'data:image/png;base64,AAAA' }, now)).toMatchObject({ field: 'sponsorName' });
    expect(validateTournamentInput({ ...base, sponsorUrl: 'javascript:alert(1)' }, now)).toMatchObject({ field: 'sponsorUrl' });
  });
  it('formats money', () => {
    expect(formatMoney(500, 'eur')).toBe('€5');
    expect(formatMoney(250, 'gbp')).toBe('£2.50');
  });
  it('validates sponsor applications and payout requests', () => {
    expect(validateSponsorApplication({ name: 'Ann', email: 'ann@acme.example', message: 'A monthly blitz arena' })).toHaveProperty('value');
    expect(validateSponsorApplication({ name: 'Ann', email: 'nope', message: 'A monthly blitz arena' })).toMatchObject({ field: 'email' });
    expect(validatePayoutRequest({ method: 'paypal', details: 'me@example.com' })).toHaveProperty('value');
    expect(validatePayoutRequest({ method: 'cash', details: 'x' })).toMatchObject({ field: 'method' });
  });
});

describe('profile links and QR codes', () => {
  it('reads usernames from links', () => {
    expect(profilePath('ahmad')).toBe('/u/ahmad');
    expect(usernameFromLink('https://chessmate.app/u/ahmad')).toBe('ahmad');
    expect(usernameFromLink('chessmate://u/some_one?x=1')).toBe('some_one');
    expect(usernameFromLink('@magnus')).toBe('magnus');
    expect(usernameFromLink('not a link!')).toBeNull();
  });
  it('builds a square matrix with finder patterns', () => {
    const m = qrMatrix('https://chessmate.app/u/ahmad');
    expect(m.length).toBe(29); // version 3
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // Finder pattern corners are dark, the ring inside is light.
    expect(m[0]![0]).toBe(true);
    expect(m[1]![1]).toBe(false);
    expect(m[3]![3]).toBe(true);
    expect(qrPath(m).size).toBe(37);
    expect(() => qrMatrix('x'.repeat(400))).toThrow();
  });
});
