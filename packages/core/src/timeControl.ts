export type TimeCategory = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface TimeControl {
  /** Starting time per side in milliseconds. */
  initialMs: number;
  /** Increment added after each move, in milliseconds. */
  incrementMs: number;
}

/** Estimated game duration: initial time + 40 moves of increment. */
export function estimatedDurationMs(tc: TimeControl): number {
  return tc.initialMs + 40 * tc.incrementMs;
}

export function timeCategory(tc: TimeControl): TimeCategory {
  const est = estimatedDurationMs(tc) / 1000;
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  if (est < 6 * 3600) return 'classical';
  return 'correspondence';
}

/** Parses "5+3" style strings (minutes + seconds increment). */
export function parseTimeControl(input: string): TimeControl {
  const m = /^\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+)\s*$/.exec(input);
  if (!m) throw new Error(`Invalid time control: ${input}`);
  return { initialMs: Math.round(Number(m[1]) * 60_000), incrementMs: Number(m[2]) * 1000 };
}

export function formatTimeControl(tc: TimeControl): string {
  const min = tc.initialMs / 60_000;
  return `${Number.isInteger(min) ? min : min.toFixed(1)}+${tc.incrementMs / 1000}`;
}

export const PRESET_TIME_CONTROLS: readonly TimeControl[] = [
  parseTimeControl('1+0'),
  parseTimeControl('2+1'),
  parseTimeControl('3+0'),
  parseTimeControl('3+2'),
  parseTimeControl('5+0'),
  parseTimeControl('5+3'),
  parseTimeControl('10+0'),
  parseTimeControl('10+5'),
  parseTimeControl('15+10'),
  parseTimeControl('30+0'),
];
