import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

/**
 * Move classification badges, ChessMate's own set. Colour is reserved for game
 * signals like these; the chrome around them stays black and white.
 * `glyph` is annotation text (!!, ?!), `icon` an Ionicons name for the
 * classes that have no annotation symbol.
 */
export interface MoveClassStyle {
  label: string;
  phrase: string;
  /** Short text form, used in lists and accessibility labels. */
  symbol: string;
  glyph?: string;
  icon?: 'star' | 'thumbs-up' | 'checkmark' | 'book' | 'arrow-forward' | 'close';
  color: string;
}

export const MOVE_CLASS: Record<MoveClass, MoveClassStyle> = {
  royal: { label: 'Queen brilliancy', phrase: 'a queen brilliancy', symbol: '!!!', glyph: '!!!', color: '#0C0C0F' },
  brilliant: { label: 'Brilliant', phrase: 'brilliant', symbol: '!!', glyph: '!!', color: '#1FB5C4' },
  great: { label: 'Great', phrase: 'a great move', symbol: '!', glyph: '!', color: '#4A78F0' },
  best: { label: 'Best', phrase: 'the best move', symbol: '★', icon: 'star', color: '#2F9E6B' },
  excellent: { label: 'Excellent', phrase: 'excellent', symbol: '👍', icon: 'thumbs-up', color: '#58B07F' },
  good: { label: 'Good', phrase: 'good', symbol: '✓', icon: 'checkmark', color: '#7D8C86' },
  book: { label: 'Book', phrase: 'a book move', symbol: 'B', icon: 'book', color: '#9A8A78' },
  forced: { label: 'Forced', phrase: 'forced', symbol: '→', icon: 'arrow-forward', color: '#7E7E88' },
  inaccuracy: { label: 'Inaccuracy', phrase: 'an inaccuracy', symbol: '?!', glyph: '?!', color: '#D9A21B' },
  mistake: { label: 'Mistake', phrase: 'a mistake', symbol: '?', glyph: '?', color: '#E07B24' },
  miss: { label: 'Miss', phrase: 'a missed chance', symbol: '✕', icon: 'close', color: '#D0507E' },
  blunder: { label: 'Blunder', phrase: 'a blunder', symbol: '??', glyph: '??', color: '#D64545' },
};

export const REVIEW_ORDER: MoveClass[] = ['royal', 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
