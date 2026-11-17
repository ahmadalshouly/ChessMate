import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, COUNTRIES, PIECE_SETS, DEFAULT_SETTINGS, applySettingsPatch, countryFlag, countryName, normalizeSettings, validateProfileEdit } from '../src';

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
  it('accepts every board theme and piece set, and maps retired ids', () => {
    for (const theme of BOARD_THEMES) expect(applySettingsPatch(DEFAULT_SETTINGS, { board: { theme } })).toHaveProperty('settings');
    for (const pieces of PIECE_SETS) expect(applySettingsPatch(DEFAULT_SETTINGS, { board: { pieces } })).toHaveProperty('settings');
    expect(applySettingsPatch(DEFAULT_SETTINGS, { board: { pieces: 'outline' } })).toHaveProperty('error');
    expect(normalizeSettings({ board: { pieces: 'outline', theme: 'midnight' } }).board).toMatchObject({ pieces: 'spatial', theme: 'midnight' });
    expect(normalizeSettings({ board: { pieces: 'bold' } }).board.pieces).toBe('bold');
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
