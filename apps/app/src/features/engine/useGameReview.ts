import type { ErrorCode, GameReview } from '@chessmate/core';
import { useEffect, useRef, useState } from 'react';

import { playClient } from '@/lib/playClient';
import type { useEngine } from '@/lib/useEngine';

import { canReviewLocally, reviewLocally, type ReviewSnapshot } from './localReview';

export interface ReviewRequestParams {
  moves: string[];
  initialFen: string;
  gameId?: string;
}

export interface GameReviewState {
  /** Moves graded so far; the whole game once `final`. */
  review: GameReview | null;
  final: boolean;
  progress: { done: number; total: number } | null;
  error: { code?: ErrorCode; message: string } | null;
  /** Where the grades come from: this device's engine, or the server. */
  source: 'device' | 'server' | null;
  /** Milliseconds from opening the review to the last move graded. */
  tookMs: number | null;
  retry: () => void;
}

/**
 * The review of a finished game, graded as fast as this device allows:
 *
 * 1. On the device (Stockfish in Web Workers, or a WebView on phones), moves
 *    stream in from the first one while the rest are searched. A game reviewed
 *    before, or prepared when it ended, opens finished.
 * 2. For online games the server is asked at the same time for a review it
 *    already stored (it grades online games when they end); if it has one, that
 *    wins and the device stops.
 * 3. If the device can't run the engine, the server grades it as before.
 */
export function useGameReview(request: ReviewRequestParams, server: ReturnType<typeof useEngine>): GameReviewState {
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<'device' | 'server' | null>(null);
  const [local, setLocal] = useState<ReviewSnapshot | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const started = useRef(0);
  const { review: serverReview } = server;
  const stopLocal = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!request.moves.length && !request.gameId) return;
    started.current = Date.now();
    setTookMs(null);
    setLocal(null);
    // Engine help stays off during a live game, on the device as on the server.
    const live = !!playClient.getState().game && !playClient.getState().game?.outcome;
    if (!request.moves.length || live || !canReviewLocally()) {
      setMode('server');
      serverReview(request);
      return;
    }
    setMode('device');
    if (request.gameId) serverReview(request, { cachedOnly: true });
    const stop = reviewLocally(request, (snap) => {
      if (snap.error) {
        // The device engine failed: the server takes over.
        stopLocal.current?.();
        stopLocal.current = null;
        setMode('server');
        serverReview(request);
        return;
      }
      setLocal(snap);
      if (snap.final) setTookMs(Date.now() - started.current);
    });
    stopLocal.current = stop;
    return () => {
      stop();
      if (stopLocal.current === stop) stopLocal.current = null;
    };
  }, [request, attempt, serverReview]);

  // A stored server review (online games) beats grading on the device.
  const stored = mode === 'device' && !local?.final ? server.state.review : null;
  useEffect(() => {
    if (!stored) return;
    stopLocal.current?.();
    stopLocal.current = null;
    setTookMs(Date.now() - started.current);
  }, [stored]);

  const retry = () => setAttempt((a) => a + 1);

  if (mode === 'server' || stored) {
    const s = server.state;
    const review = stored ?? s.review;
    return {
      review,
      final: !!review,
      progress: s.reviewProgress,
      error: review ? null : s.error,
      source: review || mode === 'server' ? 'server' : null,
      tookMs: stored ? tookMs : null,
      retry,
    };
  }
  return {
    review: local?.review ?? null,
    final: !!local?.final,
    progress: local ? { done: local.done, total: local.total } : null,
    error: null,
    source: mode === 'device' ? 'device' : null,
    tookMs,
    retry,
  };
}
