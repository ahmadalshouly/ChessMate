import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

/** Move classification badges. Colour is reserved for game signals like these. */
export const MOVE_CLASS: Record<MoveClass, { label: string; symbol: string; color: string }> = {
  best: { label: 'Best', symbol: '★', color: '#2F9E6B' },
  excellent: { label: 'Excellent', symbol: '!', color: '#4FB286' },
  good: { label: 'Good', symbol: '✓', color: '#8E8E96' },
  book: { label: 'Book', symbol: 'B', color: '#8E8E96' },
  forced: { label: 'Forced', symbol: '□', color: '#8E8E96' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#D9A21B' },
  mistake: { label: 'Mistake', symbol: '?', color: '#E07B24' },
  blunder: { label: 'Blunder', symbol: '??', color: '#D64545' },
};

export const REVIEW_ORDER: MoveClass[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
