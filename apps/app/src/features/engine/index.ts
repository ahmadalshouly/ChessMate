import { START_FEN } from '@chessmate/core';

import { prepareReview as prepareServerReview } from '@/lib/useEngine';

import { localEngine } from './localEngine';
import { canReviewLocally, prepareLocalReview } from './localReview';

export { EngineHost } from './EngineHost';
export { analyzeLocally, canReviewLocally, LOCAL_REVIEW } from './localReview';
export { useGameReview, type GameReviewState } from './useGameReview';

/** Wait after a game ends before starting the engine, so the result animation stays smooth. */
export const PREPARE_DELAY_MS = 2500;

/**
 * A game just ended: start grading it so Review opens with the moves ready.
 * Online games are graded by the server too (it stores the result), so the
 * device only helps when it can; games played off the server (computer, pass
 * and play) fall back to asking the server to prepare one.
 */
export function prepareReview(moves: string[], o: { initialFen?: string; online?: boolean } = {}) {
  if (moves.length < 2) return;
  const initialFen = o.initialFen ?? START_FEN;
  if (canReviewLocally()) {
    localEngine.warmUp();
    prepareLocalReview({ moves, initialFen });
  } else if (!o.online) {
    prepareServerReview(moves, initialFen);
  }
}
