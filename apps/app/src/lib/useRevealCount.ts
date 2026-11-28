import { useEffect, useState } from 'react';

/**
 * How many of a list's heavy parts to show yet: none on the first render, so
 * the screen paints at once, then `step` more on every animation frame until
 * all `total` are in. Lists use it to fill in their boards just after the
 * page has opened instead of making the page wait for all of them.
 */
export function useRevealCount(total: number, step = 4): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count >= total) return;
    const id = requestAnimationFrame(() => setCount((n) => Math.min(total, n + step)));
    return () => cancelAnimationFrame(id);
  }, [count, total, step]);
  return count;
}
