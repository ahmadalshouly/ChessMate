import { describe, expect, it } from 'vitest';

import { PLAY_LIMIT_DEFAULTS, cleanPlayLimits, emptyHabits, habitsView, loosens, recordGame, streakDays, type HabitState } from '../src/habits';

const H = 3600_000;
const T0 = Date.UTC(2026, 10, 2, 9, 0); // Monday 09:00 UTC

describe('play limit', () => {
  it('locks after N games inside the window, for the break length', () => {
    let s: HabitState = { ...emptyHabits(), limits: { enabled: true, maxGames: 3, windowMinutes: 60, cooldownMinutes: 120 } };
    s = recordGame(s, T0);
    s = recordGame(s, T0 + 10 * 60_000);
    expect(habitsView(s, T0 + 11 * 60_000)).toMatchObject({ gamesInWindow: 2, lockedUntil: null });
    s = recordGame(s, T0 + 20 * 60_000);
    expect(s.lockedUntil).toBe(T0 + 20 * 60_000 + 2 * H);
    expect(habitsView(s, T0 + H).lockedUntil).toBe(s.lockedUntil);
    expect(habitsView(s, s.lockedUntil! + 1).lockedUntil).toBeNull();
  });

  it('forgets games that fell out of the window', () => {
    let s: HabitState = { ...emptyHabits(), limits: { enabled: true, maxGames: 2, windowMinutes: 30, cooldownMinutes: 60 } };
    s = recordGame(s, T0);
    s = recordGame(s, T0 + 31 * 60_000);
    expect(s.lockedUntil).toBeNull();
  });

  it('treats switching off, more games, a shorter window or break as loosening', () => {
    const on = { enabled: true, maxGames: 5, windowMinutes: 60, cooldownMinutes: 60 };
    expect(loosens(on, { ...on, enabled: false })).toBe(true);
    expect(loosens(on, { ...on, maxGames: 6 })).toBe(true);
    expect(loosens(on, { ...on, windowMinutes: 30 })).toBe(true);
    expect(loosens(on, { ...on, cooldownMinutes: 30 })).toBe(true);
    expect(loosens(on, { ...on, maxGames: 3, windowMinutes: 120, cooldownMinutes: 240 })).toBe(false);
    expect(loosens(PLAY_LIMIT_DEFAULTS, { ...on, maxGames: 50 })).toBe(false);
  });

  it('validates ranges', () => {
    expect(cleanPlayLimits({ maxGames: 0 }, PLAY_LIMIT_DEFAULTS)).toHaveProperty('error');
    expect(cleanPlayLimits({ windowMinutes: 5 }, PLAY_LIMIT_DEFAULTS)).toHaveProperty('error');
    expect(cleanPlayLimits({ enabled: true, maxGames: 4, cooldownMinutes: 30 }, PLAY_LIMIT_DEFAULTS)).toEqual({ value: { enabled: true, maxGames: 4, windowMinutes: 60, cooldownMinutes: 30 } });
  });
});

describe('streak', () => {
  it('counts calendar days in a row and breaks after 24 hours without a game', () => {
    let s = emptyHabits(60); // UTC+1
    s = recordGame(s, T0);
    expect(streakDays(s, T0)).toBe(1);
    s = recordGame(s, T0 + 23 * H); // Tuesday 08:00
    expect(streakDays(s, T0 + 23 * H)).toBe(2);
    s = recordGame(s, T0 + 23 * H + 30 * 60_000); // same day again
    expect(streakDays(s, T0 + 24 * H)).toBe(2);
    expect(streakDays(s, T0 + 23.5 * H + 24 * H + 1)).toBe(0); // more than 24 h since the last game
    s = recordGame(s, T0 + 50 * H);
    expect(streakDays(s, T0 + 50 * H)).toBe(1);
    expect(s.bestStreak).toBe(2);
  });
});
