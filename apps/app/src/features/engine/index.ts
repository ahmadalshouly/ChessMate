import { START_FEN } from '@chessmate/core';

import { localEngine } from './localEngine';
import { canReviewLocally, prepareLocalReview } from './localReview';
import { canUseReview, publishWhenReviewed } from './savedReviews';

export { EngineHost } from './EngineHost';
export { analyzeLocally, canReviewLocally, LOCAL_REVIEW } from './localReview';
export { useGameReview, type GameReviewState } from './useGameReview';
export { accuracyOf, canUseReview, serverGameId, useReviewAccuracy, type Accuracy } from './savedReviews';

/** Wait after a game ends before starting the engine, so the result animation stays smooth. */
export const PREPARE_DELAY_MS = 2500;

/**
 * A game just ended: start grading it on this device so Review opens with the
 * moves ready. Only for signed-in players (review is for accounts). An online
 * game (`gameId`) has its review saved for everyone once it is graded.
 */
export function prepareReview(moves: string[], o: { initialFen?: string; gameId?: string } = {}) {
  if (moves.length < 2 || !canUseReview() || !canReviewLocally()) return;
  const req = { moves, initialFen: o.initialFen ?? START_FEN };
  if (o.gameId) publishWhenReviewed(req, o.gameId);
  localEngine.warmUp();
  prepareLocalReview(req);
}
