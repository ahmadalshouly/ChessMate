import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

export type MoveBadgeIcon =
  | { set: 'ion'; name: 'star' | 'sparkles' | 'checkmark' | 'trending-up' | 'book' | 'flash' | 'close' | 'help' | 'lock-closed' }
  | { set: 'mci'; name: 'crown' | 'call-split' };

/**
 * Move classification badges ("coins"). Colour is reserved for game signals like these.
 * `symbol` is the annotation glyph on the coin; small badges show `mark ?? symbol`.
 */
export const MOVE_CLASS: Record<MoveClass, { label: string; phrase: string; symbol: string; /** Short mark for small badges when it differs from `symbol`. */ mark?: string; color: string; icon: MoveBadgeIcon }> = {
  masterpiece: { label: 'Masterpiece', phrase: 'a masterpiece', symbol: '!!!', color: '#5A55A6', icon: { set: 'mci', name: 'crown' } },
  brilliant: { label: 'Brilliant', phrase: 'brilliant', symbol: '!!', color: '#22A0A3', icon: { set: 'ion', name: 'sparkles' } },
  best: { label: 'Best move', phrase: 'the best move', symbol: '!!', mark: '★', color: '#CFA42C', icon: { set: 'ion', name: 'star' } },
  excellent: { label: 'Excellent', phrase: 'excellent', symbol: '!', color: '#B9724B', icon: { set: 'ion', name: 'checkmark' } },
  good: { label: 'Good', phrase: 'good', symbol: '', mark: '✓', color: '#4F9A47', icon: { set: 'ion', name: 'trending-up' } },
  book: { label: 'Book move', phrase: 'a book move', symbol: '', mark: 'B', color: '#7B5439', icon: { set: 'ion', name: 'book' } },
  forced: { label: 'Forced', phrase: 'forced', symbol: '□', color: '#76767E', icon: { set: 'ion', name: 'lock-closed' } },
  inaccuracy: { label: 'Inaccuracy', phrase: 'an inaccuracy', symbol: '?!', color: '#C9A43A', icon: { set: 'ion', name: 'help' } },
  mistake: { label: 'Mistake', phrase: 'a mistake', symbol: '?', color: '#E0782A', icon: { set: 'ion', name: 'close' } },
  missed: { label: 'Missed chance', phrase: 'a missed chance', symbol: '?!?', color: '#5C8DA6', icon: { set: 'mci', name: 'call-split' } },
  blunder: { label: 'Blunder', phrase: 'a blunder', symbol: '??', color: '#C4362C', icon: { set: 'ion', name: 'flash' } },
};

/** Order of the review summary table, best to worst. */
export const REVIEW_ORDER: MoveClass[] = ['masterpiece', 'brilliant', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'missed', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
