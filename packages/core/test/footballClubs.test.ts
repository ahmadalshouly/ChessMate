import { describe, expect, it } from 'vitest';

import { FOOTBALL_CLUBS, FOOTBALL_LEAGUES, badgeInk, footballClub, isFootballClubId, searchFootballClubs, validateProfileEdit } from '../src';
import { COUNTRY_CODES } from '../src/profile';

describe('Football Mate clubs', () => {
  it('has unique ids and well-formed entries', () => {
    expect(new Set(FOOTBALL_CLUBS.map((c) => c.id)).size).toBe(FOOTBALL_CLUBS.length);
    for (const c of FOOTBALL_CLUBS) {
      expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.short).toMatch(/^[A-Z0-9]{2,4}$/);
      expect(COUNTRY_CODES.has(c.country), c.id).toBe(true);
      expect(FOOTBALL_LEAGUES).toContain(c.league);
      for (const col of c.colors) expect(col).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('looks clubs up and searches ignoring case and accents', () => {
    expect(footballClub('barcelona')?.name).toBe('FC Barcelona');
    expect(footballClub('nope')).toBeNull();
    expect(footballClub(null)).toBeNull();
    expect(isFootballClubId('liverpool')).toBe(true);
    expect(isFootballClubId(42)).toBe(false);
    expect(searchFootballClubs('atletico').map((c) => c.id)).toEqual(['atletico-madrid']);
    expect(searchFootballClubs('FENERBAHCE').map((c) => c.id)).toEqual(['fenerbahce']);
    expect(searchFootballClubs('bvb').map((c) => c.id)).toEqual(['dortmund']);
    expect(searchFootballClubs('  ')).toHaveLength(FOOTBALL_CLUBS.length);
  });

  it('picks a readable ink for the badge field', () => {
    expect(badgeInk('#FFFFFF')).toBe('#111111');
    expect(badgeInk('#FDE100')).toBe('#111111');
    expect(badgeInk('#000000')).toBe('#FFFFFF');
    expect(badgeInk('#034694')).toBe('#FFFFFF');
  });

  it('validates the club on profile edits', () => {
    expect(validateProfileEdit({ footballClub: 'psg' })).toEqual({ edit: { footballClub: 'psg' } });
    expect(validateProfileEdit({ footballClub: null })).toEqual({ edit: { footballClub: null } });
    expect(validateProfileEdit({ footballClub: 'PSG' })).toMatchObject({ field: 'footballClub' });
    expect(validateProfileEdit({})).toEqual({ edit: {} });
  });
});
