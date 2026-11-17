import { describe, expect, it } from 'vitest';
import { COUNTRIES, DEFAULT_SETTINGS, applySettingsPatch, countryFlag, countryName, normalizeSettings, validateProfileEdit } from '../src';

describe('settings', () => {
  it('applies a valid partial patch without touching other keys', () => {
    const r = applySettingsPatch(DEFAULT_SETTINGS, { gameplay: { confirmMoves: 'always' } });
    expect('settings' in r && r.settings.gameplay).toEqual({ ...DEFAULT_SETTINGS.gameplay, confirmMoves: 'always' });
    expect(DEFAULT_SETTINGS.gameplay.confirmMoves).toBe('never');
  });
  it('rejects bad values', () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { sound: { volume: 2 } })).toHaveProperty('error');
    expect(applySettingsPatch(DEFAULT_SETTINGS, { privacy: { challenges: 'strangers' } })).toHaveProperty('error');
    expect(applySettingsPatch(DEFAULT_SETTINGS, [])).toHaveProperty('error');
  });
  it('normalizes partial or corrupt stored settings', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({ board: { theme: 'contrast', pieces: 'nope' }, sound: 'x' });
    expect(s.board.theme).toBe('contrast');
    expect(s.board.pieces).toBe('classic');
    expect(s.sound).toEqual(DEFAULT_SETTINGS.sound);
  });
});

describe('profile edits and countries', () => {
  it('validates and trims', () => {
    expect(validateProfileEdit({ displayName: '  A  b ', bio: '  ', country: 'jo' })).toEqual({ edit: { displayName: 'A b', bio: null, country: 'JO' } });
    expect(validateProfileEdit({ displayName: '' })).toHaveProperty('field', 'displayName');
    expect(validateProfileEdit({ displayName: '<script>' })).toHaveProperty('field', 'displayName');
  });
  it('has unique codes, names and flags', () => {
    expect(new Set(COUNTRIES.map(([c]) => c)).size).toBe(COUNTRIES.length);
    expect(countryName('se')).toBe('Sweden');
    expect(countryFlag('SE')).toBe('🇸🇪');
    expect(countryFlag(null)).toBe('');
  });
});
