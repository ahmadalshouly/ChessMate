import { useEffect, useRef } from 'react';

import { haptic } from './haptics';
import { moveSound, playMoveSound, playSound } from './sounds';

/**
 * Sound plus vibration for a move that was just played, from its SAN. `fenAfter` lets
 * the board, which also sounds moves, skip the same move: each move plays once.
 */
export function moveFeedback(san: string, fenAfter?: string): void {
  const sound = moveSound(san);
  playMoveSound(sound, fenAfter);
  haptic(sound === 'check' ? 'check' : sound === 'capture' ? 'capture' : 'move');
}

export function gameStartFeedback(): void {
  playSound('start');
}

/** End-of-game cue: a fanfare for a win, a soft two-note fall for a loss, the plain end chime otherwise. */
export function gameEndFeedback(result?: 'win' | 'loss' | 'draw'): void {
  playSound(result === 'win' ? 'win' : result === 'loss' ? 'lose' : 'end');
  haptic(result === 'loss' ? 'lose' : 'end');
}

/**
 * Plays move, start and end cues for a game kept on this device (computer,
 * pass-and-play, over the board). Only a history that grows by one move makes
 * a sound, so takebacks, resets and loading a position stay quiet.
 */
export function useMoveFeedback(history: readonly { san: string; fenAfter?: string }[], over: boolean, opts: { startCue?: boolean } = {}) {
  const prevLen = useRef(history.length);
  const prevOver = useRef(over);
  const startCue = opts.startCue ?? false;

  useEffect(() => {
    if (startCue) gameStartFeedback();
  }, [startCue]);

  useEffect(() => {
    const last = history[history.length - 1];
    if (history.length === prevLen.current + 1 && last) moveFeedback(last.san, last.fenAfter);
    prevLen.current = history.length;
  }, [history]);

  useEffect(() => {
    if (over && !prevOver.current) gameEndFeedback();
    prevOver.current = over;
  }, [over]);
}

/** When the low-time cue sounds: 10% of the starting time, kept between 5 and 20 seconds. */
export function lowTimeThresholdMs(initialMs: number): number {
  return Math.min(20_000, Math.max(5_000, initialMs * 0.1));
}

/** Plays the low-time cue once per game when the player's clock runs low. */
export function useLowTimeWarning(gameId: string | null, live: boolean, remainingMs: number | null, initialMs: number) {
  const warned = useRef<string | null>(null);
  const low = live && gameId !== null && remainingMs !== null && remainingMs > 0 && remainingMs <= lowTimeThresholdMs(initialMs);
  useEffect(() => {
    if (!low || warned.current === gameId) return;
    warned.current = gameId;
    playSound('lowTime');
    haptic('lowTime');
  }, [low, gameId]);
}
