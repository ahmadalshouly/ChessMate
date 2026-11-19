import { describe, expect, it } from 'vitest';

import { arenaPoints, profilePath, qrMatrix, qrPath, usernameFromLink, validateTournamentInput } from '../src';

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
