import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Stepping back and forward through a game's moves while it is played.
 * `shown` is the ply on the board; it follows new moves while you are at the
 * latest one, and stays put while you look back.
 */
export function useHistoryNav(length: number) {
  const [viewing, setViewing] = useState<number | null>(null);
  const shown = viewing === null ? length : Math.min(viewing, length);
  const live = shown === length;

  const goTo = (ply: number) => {
    const p = Math.max(0, Math.min(length, ply));
    setViewing(p >= length ? null : p);
  };
  const back = () => goTo(shown - 1);
  const forward = () => goTo(shown + 1);
  const toLive = () => setViewing(null);

  // Arrow keys on the web and hardware keyboards.
  const ref = useRef({ back, forward });
  useEffect(() => {
    ref.current = { back, forward };
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') ref.current.back();
      else if (e.key === 'ArrowRight') ref.current.forward();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { shown, live, goTo, back, forward, toLive, canBack: shown > 0, canForward: shown < length };
}

