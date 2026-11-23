/**
 * Play habits: a self-chosen play limit (anti-addiction) and a daily streak.
 *
 * Play limit: "after N games within W minutes, no games for C minutes". The
 * server counts every finished game and, once the limit is reached, locks the
 * account until the break is over. During a break the limit can be made
 * stricter but not looser, and it cannot be switched off.
 *
 * Streak: days in a row with at least one finished game. It breaks when more
 * than 24 hours pass without playing. Days follow the player's own calendar.
 */

export interface PlayLimitSettings {
  enabled: boolean;
  /** Games allowed in a row… */
  maxGames: number;
  /** …within this many minutes… */
  windowMinutes: number;
  /** …before a break of this many minutes. */
  cooldownMinutes: number;
}

export const PLAY_LIMIT_DEFAULTS: PlayLimitSettings = { enabled: false, maxGames: 5, windowMinutes: 60, cooldownMinutes: 60 };

export const PLAY_LIMIT_RANGES = {
  maxGames: { min: 1, max: 50 },
  windowMinutes: { min: 10, max: 24 * 60 },
  cooldownMinutes: { min: 10, max: 7 * 24 * 60 },
} as const;

/** Choices offered in the app (minutes). */
export const PLAY_LIMIT_WINDOW_CHOICES = [30, 60, 120, 180, 360, 720, 1440] as const;
export const PLAY_LIMIT_COOLDOWN_CHOICES = [15, 30, 60, 120, 240, 480, 720, 1440, 2880] as const;

/** Streak breaks after this long without a finished game. */
export const STREAK_GRACE_MS = 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

export interface HabitState {
  limits: PlayLimitSettings;
  lockedUntil: number | null;
  /** End times of games inside the current window. */
  recentGames: number[];
  streakStart: number | null;
  lastPlayedAt: number | null;
  bestStreak: number;
  /** Minutes east of UTC. */
  tzOffsetMin: number;
}

export interface StreakView {
  days: number;
  best: number;
  lastPlayedAt: number | null;
  /** When the streak breaks unless another game is finished (null without a streak). */
  expiresAt: number | null;
  /** True when today's game is already played (by the player's calendar). */
  playedToday: boolean;
}

export interface HabitsView {
  limits: PlayLimitSettings;
  lockedUntil: number | null;
  /** Games counted in the current window. */
  gamesInWindow: number;
  streak: StreakView;
}

export function emptyHabits(tzOffsetMin = 0): HabitState {
  return { limits: { ...PLAY_LIMIT_DEFAULTS }, lockedUntil: null, recentGames: [], streakStart: null, lastPlayedAt: null, bestStreak: 0, tzOffsetMin };
}

const dayOf = (ms: number, tz: number) => Math.floor((ms + tz * 60_000) / DAY_MS);

/** Current streak in days (0 when broken or never started). */
export function streakDays(s: HabitState, now: number): number {
  if (s.lastPlayedAt === null || s.streakStart === null || now - s.lastPlayedAt > STREAK_GRACE_MS) return 0;
  return dayOf(s.lastPlayedAt, s.tzOffsetMin) - dayOf(s.streakStart, s.tzOffsetMin) + 1;
}

export function streakView(s: HabitState, now: number): StreakView {
  const days = streakDays(s, now);
  return {
    days,
    best: Math.max(s.bestStreak, days),
    lastPlayedAt: s.lastPlayedAt,
    expiresAt: days > 0 && s.lastPlayedAt !== null ? s.lastPlayedAt + STREAK_GRACE_MS : null,
    playedToday: s.lastPlayedAt !== null && dayOf(s.lastPlayedAt, s.tzOffsetMin) === dayOf(now, s.tzOffsetMin),
  };
}

/** The lock still in force at `now`, or null. */
export function activeLock(s: Pick<HabitState, 'lockedUntil'>, now: number): number | null {
  return s.lockedUntil !== null && s.lockedUntil > now ? s.lockedUntil : null;
}

export function habitsView(s: HabitState, now: number): HabitsView {
  const windowStart = now - s.limits.windowMinutes * 60_000;
  return {
    limits: s.limits,
    lockedUntil: activeLock(s, now),
    gamesInWindow: s.limits.enabled ? s.recentGames.filter((t) => t > windowStart).length : 0,
    streak: streakView(s, now),
  };
}

/**
 * A game finished at `now`: extends (or restarts) the streak and, with a limit
 * on, counts it and starts the break when the limit is reached.
 */
export function recordGame(s: HabitState, now: number): HabitState {
  const broken = s.lastPlayedAt === null || s.streakStart === null || now - s.lastPlayedAt > STREAK_GRACE_MS;
  const next: HabitState = { ...s, streakStart: broken ? now : s.streakStart, lastPlayedAt: now };
  next.bestStreak = Math.max(s.bestStreak, streakDays(next, now));
  if (!s.limits.enabled) return { ...next, recentGames: [] };
  const windowStart = now - s.limits.windowMinutes * 60_000;
  const recent = [...s.recentGames.filter((t) => t > windowStart), now];
  if (recent.length >= s.limits.maxGames && !activeLock(s, now)) {
    return { ...next, recentGames: [], lockedUntil: now + s.limits.cooldownMinutes * 60_000 };
  }
  return { ...next, recentGames: recent };
}

const clampInt = (v: unknown, r: { min: number; max: number }): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= r.min && n <= r.max ? n : null;
};

/** Checks settings from a request; returns them or an error message. */
export function cleanPlayLimits(input: Record<string, unknown>, prev: PlayLimitSettings): { value: PlayLimitSettings } | { error: string } {
  const maxGames = input.maxGames === undefined ? prev.maxGames : clampInt(input.maxGames, PLAY_LIMIT_RANGES.maxGames);
  const windowMinutes = input.windowMinutes === undefined ? prev.windowMinutes : clampInt(input.windowMinutes, PLAY_LIMIT_RANGES.windowMinutes);
  const cooldownMinutes = input.cooldownMinutes === undefined ? prev.cooldownMinutes : clampInt(input.cooldownMinutes, PLAY_LIMIT_RANGES.cooldownMinutes);
  if (maxGames === null) return { error: `Games must be between ${PLAY_LIMIT_RANGES.maxGames.min} and ${PLAY_LIMIT_RANGES.maxGames.max}` };
  if (windowMinutes === null) return { error: 'Choose a time window between 10 minutes and 24 hours' };
  if (cooldownMinutes === null) return { error: 'Choose a break between 10 minutes and 7 days' };
  const enabled = input.enabled === undefined ? prev.enabled : input.enabled === true;
  return { value: { enabled, maxGames, windowMinutes, cooldownMinutes } };
}

/**
 * True when `next` allows more play than `prev`: switching the limit off,
 * more games, a shorter window (games fall out of it sooner) or a shorter break.
 * Not allowed during a break.
 */
export function loosens(prev: PlayLimitSettings, next: PlayLimitSettings): boolean {
  if (!prev.enabled) return false;
  return !next.enabled || next.maxGames > prev.maxGames || next.windowMinutes < prev.windowMinutes || next.cooldownMinutes < prev.cooldownMinutes;
}
