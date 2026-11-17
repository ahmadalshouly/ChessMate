import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

/** Icon drawn in the middle of a medallion (see components/MoveBadge.tsx). */
export type BadgeIcon =
  | 'star'
  | 'sparkles'
  | 'target'
  | 'check'
  | 'trend-check'
  | 'book'
  | 'arrow'
  | 'trend-down'
  | 'cross'
  | 'crossed-arrows'
  | 'bolt'
  | 'crown';

/**
 * Move classification medallions. Each class is an embossed coin in its own
 * metal colour; colour is reserved for game signals like these, the chrome
 * around them stays black and white. `glyph` is the annotation symbol shown
 * under the icon (and alone on the board).
 */
export interface MoveClassStyle {
  label: string;
  phrase: string;
  /** Short text form, used in lists and accessibility labels. */
  symbol: string;
  glyph?: string;
  icon: BadgeIcon;
  color: string;
}

export const MOVE_CLASS: Record<MoveClass, MoveClassStyle> = {
  masterpiece: { label: 'Masterpiece', phrase: 'a Masterpiece', symbol: '!!!', glyph: '!!!', icon: 'crown', color: '#6A5FB4' },
  brilliant: { label: 'Brilliant', phrase: 'brilliant', symbol: '!!', glyph: '!!', icon: 'sparkles', color: '#2FA3A6' },
  great: { label: 'Great', phrase: 'a great move', symbol: '!', glyph: '!', icon: 'target', color: '#3F6FC4' },
  best: { label: 'Best Move', phrase: 'the best move', symbol: '★', icon: 'star', color: '#C99A22' },
  excellent: { label: 'Excellent', phrase: 'excellent', symbol: '✓', icon: 'check', color: '#C0784A' },
  good: { label: 'Good', phrase: 'good', symbol: '✓', icon: 'trend-check', color: '#4E9A47' },
  book: { label: 'Book Move', phrase: 'a book move', symbol: 'Book', icon: 'book', color: '#7A5137' },
  forced: { label: 'Forced', phrase: 'forced', symbol: '→', icon: 'arrow', color: '#6E7681' },
  inaccuracy: { label: 'Inaccuracy', phrase: 'an inaccuracy', symbol: '?!', glyph: '?!', icon: 'trend-down', color: '#E0B83C' },
  mistake: { label: 'Mistake', phrase: 'a mistake', symbol: '?', glyph: '?', icon: 'cross', color: '#E07B2C' },
  miss: { label: 'Missed Chance', phrase: 'a missed chance', symbol: '✕', icon: 'crossed-arrows', color: '#5E8DAA' },
  blunder: { label: 'Blunder', phrase: 'a blunder', symbol: '??', glyph: '??', icon: 'bolt', color: '#C93A33' },
};

export const REVIEW_ORDER: MoveClass[] = ['masterpiece', 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
