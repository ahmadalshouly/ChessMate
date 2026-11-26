import type { GameReview } from '@chessmate/core';
import { useEffect, useRef, useState } from 'react';

import { playClient } from '@/lib/playClient';

import { isDeepReview, keepReview, reviewLocally, type ReviewMode, type ReviewSnapshot } from './localReview';
import { fetchSavedReview, noteAccuracy, publishReview } from './savedReviews';

export interface ReviewRequestParams {
  moves: string[];
  initialFen: string;
  /** Server id of an online game: its review is saved and shared. */
  gameId?: string;
  /** How deep to search: standard, or Deep (on request). */
  mode?: ReviewMode;
}

export type ReviewErrorCode = 'engine_locked' | 'no_engine' | 'engine_failed';

export interface GameReviewState {
  /** Moves graded so far; the whole game once `final`. */
  review: GameReview | null;
  final: boolean;
  progress: { done: number; total: number } | null;
  error: { code: ReviewErrorCode; message?: string } | null;
  /** Where the review comes from: graded on this device, or the saved review of the game. */
  source: 'device' | 'saved' | null;
  /** Whose engine is grading: this device's, or the server's when the device can't run one (or it stalled). */
  where: 'device' | 'server' | null;
  /** Still checking whether the game already has a saved review. */
  checking: boolean;
  /** Milliseconds from opening the review to the last move graded. */
  tookMs: number | null;
  retry: () => void;
}

/**
 * The review of a finished game. Reviews are graded on the player's device
 * (Stockfish in Web Workers, or a WebView on phones). When the device can't
 * run the engine, or it fails or stalls, the server's engine grades the moves
 * that are left (see localReview.ts), so a review always finishes.
 *
 * 1. An online game that already has a saved review opens that review (from
 *    any account), without grading again. A Deep request takes only a Deep
 *    saved review.
 * 2. Otherwise this device grades it, moves streaming in from the first one.
 *    A game reviewed on this device before opens finished.
 * 3. When it finishes, an online game's review is saved for everyone (the
 *    server accepts it from the two players only, and a later one only when
 *    it searched deeper).
 *
 * Pass `enabled: false` (signed out) to do nothing.
 */
export function useGameReview(request: ReviewRequestParams, enabled = true): GameReviewState {
  const [attempt, setAttempt] = useState(0);
  const [local, setLocal] = useState<ReviewSnapshot | null>(null);
  const [saved, setSaved] = useState<GameReview | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<GameReviewState['error']>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (!enabled || !request.moves.length) return;
    started.current = Date.now();
    setTookMs(null);
    setLocal(null);
    setSaved(null);
    setError(null);
    // Engine help stays off during a live game.
    const live = !!playClient.getState().game && !playClient.getState().game?.outcome;
    if (live) {
      setError({ code: 'engine_locked' });
      return;
    }
    let active = true;
    let stopLocal: (() => void) | null = null;
    let haveSaved = false;
    const { gameId } = request;

    const finish = (review: GameReview) => {
      setTookMs(Date.now() - started.current);
      noteAccuracy(request, review.accuracy);
    };

    const startLocal = () => {
      stopLocal = reviewLocally(request, (snap) => {
        if (!active || haveSaved) return;
        if (snap.error) {
          setError({ code: 'engine_failed', message: snap.error });
          return;
        }
        setLocal(snap);
        if (!snap.final || !snap.review) return;
        finish(snap.review);
        // First (or deeper) review of an online game: save it so nobody grades it again.
        if (gameId && snap.evals) {
          const mine = snap.review;
          publishReview(gameId, snap.evals).then(
            (s) => {
              // The server keeps the review it already had when that one is as deep: shown only then.
              if (!active || !s || s.depth < mine.depth) return;
              keepReview(request, s);
              noteAccuracy(request, s.accuracy);
              setSaved(s);
              haveSaved = true;
            },
            () => {
              // Offline: kept on this device, saved the next time it is opened.
            },
          );
        }
      });
    };

    if (!gameId) {
      startLocal();
    } else {
      // Ask for a saved review first; the device starts at the same time so
      // nothing is lost when there is none, and stops if there is.
      setChecking(true);
      fetchSavedReview(gameId).then(
        (s) => {
          if (!active) return;
          setChecking(false);
          // A Deep request grades again unless the saved review is Deep too.
          if (!s || (request.mode === 'deep' && !isDeepReview(s))) return;
          haveSaved = true;
          stopLocal?.();
          stopLocal = null;
          keepReview(request, s);
          setSaved(s);
          finish(s);
        },
        () => {
          if (active) setChecking(false);
        },
      );
      startLocal();
    }
    return () => {
      active = false;
      stopLocal?.();
    };
  }, [request, attempt, enabled]);

  const retry = () => setAttempt((a) => a + 1);

  if (saved) return { review: saved, final: true, progress: null, error: null, source: 'saved', where: null, checking: false, tookMs, retry };
  return {
    review: local?.review ?? null,
    final: !!local?.final && !!local.review,
    progress: local ? { done: local.done, total: local.total } : null,
    error,
    source: local ? 'device' : null,
    where: local?.where ?? null,
    checking,
    tookMs,
    retry,
  };
}
