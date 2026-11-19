import { describe, expect, it } from 'vitest';

import { arenaPoints, formatMoney, profilePath, qrMatrix, qrPath, usernameFromLink, validatePayoutRequest, validateSponsorApplication, validateTournamentInput } from '../src';

describe('arena points', () => {
  it('doubles wins and draws on a streak', () => {
    expect(arenaPoints('win', 0)).toBe(2);
    expect(arenaPoints('draw', 1)).toBe(1);
    expect(arenaPoints('win', 2)).toBe(4);
    expect(arenaPoints('draw', 3)).toBe(2);
    expect(arenaPoints('loss', 5)).toBe(0);
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
