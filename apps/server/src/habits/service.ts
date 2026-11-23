import {
  activeLock,
  cleanPlayLimits,
  emptyHabits,
  habitsView,
  loosens,
  recordGame,
  type HabitState,
  type HabitsView,
} from '@chessmate/core';
import { activePlayLocks, getPlayHabits, savePlayHabits, type Database, type PlayHabits } from '@chessmate/db';

export class HabitsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Minimum gap between two counted computer games, and the plies a game needs to count. */
const COMPUTER_GAME_GAP_MS = 60_000;
const COMPUTER_GAME_MIN_PLIES = 10;

const toState = (r: PlayHabits): HabitState => ({
  limits: { enabled: r.limitsEnabled, maxGames: r.maxGames, windowMinutes: r.windowMinutes, cooldownMinutes: r.cooldownMinutes },
  lockedUntil: r.lockedUntil?.getTime() ?? null,
  recentGames: Array.isArray(r.recentGames) ? r.recentGames : [],
  streakStart: r.streakStart?.getTime() ?? null,
  lastPlayedAt: r.lastPlayedAt?.getTime() ?? null,
  bestStreak: r.bestStreak,
  tzOffsetMin: r.tzOffsetMin,
});

/**
 * Play limits and streaks for accounts. The lock is enforced here: the game
 * server asks `lockOf` (no database round trip) before every way of starting
 * a game, and the limit cannot be loosened or switched off during a break.
 * Without a database (dev), state lives in memory.
 */
export class PlayHabitsService {
  private readonly db: Database | null;
  private readonly now: () => number;
  /** Active locks, for synchronous checks. */
  private locks = new Map<string, number>();
  private memory = new Map<string, HabitState & { lastComputerGameAt: number | null }>();

  constructor(opts: { db?: Database | null; now?: () => number } = {}) {
    this.db = opts.db ?? null;
    this.now = opts.now ?? Date.now;
  }

  /** Loads the locks in force, so a restart can't lift a break. */
  async load() {
    if (!this.db) return;
    for (const l of await activePlayLocks(this.db, new Date(this.now()))) this.locks.set(l.userId, l.lockedUntil.getTime());
  }

  /** The end of this player's break, or null when they may play. */
  lockOf(userId: string): number | null {
    const until = this.locks.get(userId);
    if (until === undefined) return null;
    if (until <= this.now()) {
      this.locks.delete(userId);
      return null;
    }
    return until;
  }

  private async read(userId: string): Promise<HabitState & { lastComputerGameAt: number | null }> {
    if (!this.db) return this.memory.get(userId) ?? { ...emptyHabits(), lastComputerGameAt: null };
    const row = await getPlayHabits(this.db, userId);
    return row ? { ...toState(row), lastComputerGameAt: row.lastComputerGameAt?.getTime() ?? null } : { ...emptyHabits(), lastComputerGameAt: null };
  }

  private async write(userId: string, s: HabitState & { lastComputerGameAt: number | null }) {
    const lock = activeLock(s, this.now());
    if (lock) this.locks.set(userId, lock);
    else this.locks.delete(userId);
    if (!this.db) {
      this.memory.set(userId, s);
      return;
    }
    await savePlayHabits(this.db, {
      userId,
      limitsEnabled: s.limits.enabled,
      maxGames: s.limits.maxGames,
      windowMinutes: s.limits.windowMinutes,
      cooldownMinutes: s.limits.cooldownMinutes,
      lockedUntil: s.lockedUntil ? new Date(s.lockedUntil) : null,
      recentGames: s.recentGames,
      streakStart: s.streakStart ? new Date(s.streakStart) : null,
      lastPlayedAt: s.lastPlayedAt ? new Date(s.lastPlayedAt) : null,
      bestStreak: s.bestStreak,
      tzOffsetMin: s.tzOffsetMin,
      lastComputerGameAt: s.lastComputerGameAt ? new Date(s.lastComputerGameAt) : null,
    });
  }

  /** Limits, break and streak. `tzOffsetMin` (minutes east of UTC) keeps streak days on the player's calendar. */
  async view(userId: string, tzOffsetMin?: number): Promise<HabitsView> {
    const s = await this.read(userId);
    if (tzOffsetMin !== undefined && Number.isInteger(tzOffsetMin) && Math.abs(tzOffsetMin) <= 14 * 60 && tzOffsetMin !== s.tzOffsetMin) {
      s.tzOffsetMin = tzOffsetMin;
      await this.write(userId, s);
    }
    return habitsView(s, this.now());
  }

  /** A game finished: streak and limit. Returns the new view and whether a break just started. */
  async gameFinished(userId: string): Promise<{ view: HabitsView; lockedNow: boolean }> {
    const before = await this.read(userId);
    const after = { ...recordGame(before, this.now()), lastComputerGameAt: before.lastComputerGameAt };
    await this.write(userId, after);
    const lockedNow = !activeLock(before, this.now()) && !!activeLock(after, this.now());
    return { view: habitsView(after, this.now()), lockedNow };
  }

  /** A game against the computer finished on the device (counted at most once a minute, 10+ plies). */
  async computerGame(userId: string, plies: number): Promise<{ view: HabitsView; lockedNow: boolean }> {
    const s = await this.read(userId);
    if (!Number.isInteger(plies) || plies < COMPUTER_GAME_MIN_PLIES || (s.lastComputerGameAt !== null && this.now() - s.lastComputerGameAt < COMPUTER_GAME_GAP_MS)) {
      return { view: habitsView(s, this.now()), lockedNow: false };
    }
    const after = { ...recordGame(s, this.now()), lastComputerGameAt: this.now() };
    await this.write(userId, after);
    return { view: habitsView(after, this.now()), lockedNow: !activeLock(s, this.now()) && !!activeLock(after, this.now()) };
  }

  /** Changes the limit. During a break it may only get stricter. */
  async update(userId: string, input: Record<string, unknown>): Promise<HabitsView> {
    const s = await this.read(userId);
    const r = cleanPlayLimits(input, s.limits);
    if ('error' in r) throw new HabitsError(400, r.error);
    const lock = activeLock(s, this.now());
    if (lock && loosens(s.limits, r.value)) {
      throw new HabitsError(403, 'Your break is on. You can loosen or switch off the limit once it ends.');
    }
    // Turning the limit on (or changing it) starts counting from now.
    const reset = !s.limits.enabled && r.value.enabled;
    const next = { ...s, limits: r.value, recentGames: reset || !r.value.enabled ? [] : s.recentGames };
    await this.write(userId, next);
    return habitsView(next, this.now());
  }
}
