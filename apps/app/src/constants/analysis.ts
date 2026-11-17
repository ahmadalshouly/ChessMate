import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

/**
 * Move classification badges (coin style, see components/MoveBadge). Colour is reserved for
 * game signals like these. `icon` is a MaterialCommunityIcons name.
 */
export const MOVE_CLASS: Record<MoveClass, { label: string; phrase: string; /** Annotation (!!, ?), empty when the icon says it all. */ symbol: string; color: string; icon: string }> = {
  great: { label: 'Masterpiece', phrase: 'a masterpiece', symbol: '!!!', color: '#6458B4', icon: 'crown' },
  brilliant: { label: 'Brilliant', phrase: 'brilliant', symbol: '!!', color: '#239C9F', icon: 'creation' },
  best: { label: 'Best move', phrase: 'the best move', symbol: '', color: '#C99A1E', icon: 'star' },
  excellent: { label: 'Excellent', phrase: 'excellent', symbol: '!', color: '#B36F45', icon: 'check-bold' },
  good: { label: 'Good', phrase: 'good', symbol: '', color: '#4A9748', icon: 'trending-up' },
  book: { label: 'Book move', phrase: 'a book move', symbol: '', color: '#7A5136', icon: 'book-open-variant' },
  forced: { label: 'Forced', phrase: 'forced', symbol: '', color: '#7E808A', icon: 'square-outline' },
  inaccuracy: { label: 'Inaccuracy', phrase: 'an inaccuracy', symbol: '?!', color: '#D49A17', icon: 'trending-down' },
  miss: { label: 'Missed chance', phrase: 'a missed chance', symbol: '?!?', color: '#4F84A3', icon: 'shuffle-variant' },
  mistake: { label: 'Mistake', phrase: 'a mistake', symbol: '?', color: '#E0761F', icon: 'close-thick' },
  blunder: { label: 'Blunder', phrase: 'a blunder', symbol: '??', color: '#C93636', icon: 'lightning-bolt' },
};

export const REVIEW_ORDER: MoveClass[] = ['great', 'brilliant', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'miss', 'mistake', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
