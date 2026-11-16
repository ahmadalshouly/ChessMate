import type { Color } from './types';
import type { TimeControl } from './timeControl';

/**
 * Authoritative chess clock. Pure data + functions so it can run on the
 * server (source of truth) and be mirrored on clients for display.
 */
export interface ClockState {
  remainingMs: Record<Color, number>;
  incrementMs: number;
  /** Side whose clock is running, or null when stopped. */
  running: Color | null;
  /** Timestamp (ms) at which the running clock last started. */
  startedAt: number | null;
}

export function createClock(tc: TimeControl): ClockState {
  return {
    remainingMs: { w: tc.initialMs, b: tc.initialMs },
    incrementMs: tc.incrementMs,
    running: null,
    startedAt: null,
  };
}

export function remaining(clock: ClockState, color: Color, now: number): number {
  const base = clock.remainingMs[color];
  if (clock.running === color && clock.startedAt !== null) {
    return Math.max(0, base - (now - clock.startedAt));
  }
  return base;
}

export function startClock(clock: ClockState, color: Color, now: number): ClockState {
  return { ...clock, running: color, startedAt: now };
}

/**
 * Called when `color` completes a move. Deducts elapsed time, adds increment
 * and starts the opponent's clock. Returns flagged=true if time ran out
 * before the move was made.
 */
export function pressClock(
  clock: ClockState,
  color: Color,
  now: number,
): { clock: ClockState; flagged: boolean } {
  const left = remaining(clock, color, now);
  if (left <= 0) {
    return { clock: stopClock(clock, now), flagged: true };
  }
  const opponent: Color = color === 'w' ? 'b' : 'w';
  return {
    clock: {
      ...clock,
      remainingMs: { ...clock.remainingMs, [color]: left + clock.incrementMs },
      running: opponent,
      startedAt: now,
    },
    flagged: false,
  };
}

export function stopClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  const c = clock.running;
  return {
    ...clock,
    remainingMs: { ...clock.remainingMs, [c]: remaining(clock, c, now) },
    running: null,
    startedAt: null,
  };
}

export function isFlagged(clock: ClockState, now: number): Color | null {
  if (clock.running && remaining(clock, clock.running, now) <= 0) return clock.running;
  return null;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10_000) {
    return `0:0${(total / 1000).toFixed(1)}`;
  }
  const s = Math.ceil(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
