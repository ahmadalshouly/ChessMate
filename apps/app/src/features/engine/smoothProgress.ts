import { useEffect, useRef, useState } from 'react';

/** How often the shown progress moves. */
const TICK_MS = 100;
/** Share of the gap to the real progress closed each tick when catching up (~1 s to close most of it). */
const CATCH_UP = 0.2;
/** Share of the gap to the creep ceiling closed each tick while waiting for the engine. */
const CREEP = 0.04;
/** The shown progress never passes this before the review is actually finished. */
const MAX_BEFORE_DONE = 0.99;

export interface ProgressStep {
  shown: number;
  /** Positions per millisecond, smoothed; 0 until two results are in. */
  rate: number;
  lastDone: number;
  lastAt: number;
}

/**
 * One tick of the shown progress (0–1) toward the real share of positions
 * graded. It never goes backwards and never jumps: it eases up to the real
 * share, and while no new result comes in it keeps creeping toward a little
 * past it (about as far as the engine's recent pace would have got, at least
 * a position or two), slowing as it nears that point. So a pause reads as
 * steady progress, and a burst of results as a quick, smooth climb.
 */
export function stepProgress(p: ProgressStep, done: number, total: number, now: number): ProgressStep {
  const real = total > 0 ? Math.min(1, done / total) : 0;
  let { rate, lastDone, lastAt } = p;
  if (done !== lastDone) {
    if (done > lastDone && lastAt > 0) {
      const r = (done - lastDone) / Math.max(1, now - lastAt);
      rate = rate > 0 ? rate * 0.7 + r * 0.3 : r;
    }
    lastDone = done;
    lastAt = now;
  }
  let shown = p.shown;
  if (real >= 1) shown += (1 - shown) * 0.35;
  else if (shown < real) shown += Math.max((real - shown) * CATCH_UP, Math.min(real - shown, 0.002));
  else {
    // Waiting: aim a little past the real share, as far as the recent pace suggests.
    const sinceLast = lastAt > 0 ? now - lastAt : 0;
    const expected = total > 0 ? (rate * sinceLast) / total : 0;
    const ahead = total > 0 ? Math.max(1.5 / total, 0.02) : 0.02;
    const ceiling = Math.min(MAX_BEFORE_DONE, real + Math.min(ahead * 2, Math.max(ahead, expected)));
    if (ceiling > shown) shown += (ceiling - shown) * CREEP;
  }
  return { shown: Math.min(1, Math.max(p.shown, shown)), rate, lastDone, lastAt };
}

/**
 * The review progress to show, as a share from 0 to 1, moving smoothly and
 * steadily while `active` (see stepProgress). Jumps straight to 1 once
 * `finished`, and to the real share when not active.
 */
export function useSmoothProgress(done: number, total: number, o: { active: boolean; finished?: boolean }): number {
  const real = total > 0 ? Math.min(1, done / total) : 0;
  const latest = useRef({ done, total });
  useEffect(() => {
    latest.current = { done, total };
  }, [done, total]);
  const [shown, setShown] = useState(real);
  const step = useRef<ProgressStep>({ shown: real, rate: 0, lastDone: done, lastAt: 0 });

  useEffect(() => {
    if (!o.active || o.finished) return;
    step.current = { ...step.current, lastAt: step.current.lastAt || Date.now() };
    const id = setInterval(() => {
      const { done: d, total: t } = latest.current;
      step.current = stepProgress(step.current, d, t, Date.now());
      setShown((prev) => (Math.abs(prev - step.current.shown) < 0.0005 ? prev : step.current.shown));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [o.active, o.finished]);

  // A new game (fewer positions done than before): start over.
  useEffect(() => {
    if (done < step.current.lastDone) {
      step.current = { shown: real, rate: 0, lastDone: done, lastAt: Date.now() };
      setShown(real);
    }
  }, [done, real]);

  if (o.finished) return 1;
  if (!o.active) return real;
  return Math.max(shown, 0);
}
