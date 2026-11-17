import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

import { translate } from '@/i18n';

/** Move classification badges. Colour is reserved for game signals like these. Labels follow the app language. */
const CLASS_STYLE: Record<MoveClass, { symbol: string; color: string }> = {
  best: { symbol: '★', color: '#2F9E6B' },
  excellent: { symbol: '!', color: '#4FB286' },
  good: { symbol: '✓', color: '#8E8E96' },
  book: { symbol: 'B', color: '#8E8E96' },
  forced: { symbol: '□', color: '#8E8E96' },
  inaccuracy: { symbol: '?!', color: '#D9A21B' },
  mistake: { symbol: '?', color: '#E07B24' },
  blunder: { symbol: '??', color: '#D64545' },
};

export const MOVE_CLASS = Object.fromEntries(
  (Object.keys(CLASS_STYLE) as MoveClass[]).map((c) => [
    c,
    {
      ...CLASS_STYLE[c],
      get label() {
        return translate(`moveClass.${c}.label`);
      },
      get phrase() {
        return translate(`moveClass.${c}.phrase`);
      },
    },
  ]),
) as Record<MoveClass, { label: string; phrase: string; symbol: string; color: string }>;

export const REVIEW_ORDER: MoveClass[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
