export { EngineHost } from './EngineHost';
export { analyzeLocally, canReviewLocally, isDeepReview, LOCAL_REVIEW, REVIEW_PLANS, type ReviewMode } from './localReview';
export { useGameReview, type GameReviewState } from './useGameReview';
export { accuracyOf, canUseReview, serverGameId, useReviewAccuracy, type Accuracy } from './savedReviews';

// Games are graded only when Review is opened, never in the background after a
// game ends: the engine runs only while a review, an analysis or a Stockfish
// bot needs it, so the phone does not heat up after every game.
