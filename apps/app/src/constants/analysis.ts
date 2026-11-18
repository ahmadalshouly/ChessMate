import { formatScore, isMatedScore, type MoveClass, type Score } from '@chessmate/core';

import { translate } from '@/i18n';

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
 * under the icon (and alone on the board). `label` and `phrase` follow the app
 * language (keys `moveClass.<class>.label|phrase`).
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

const CLASS_STYLE: Record<MoveClass, Omit<MoveClassStyle, 'label' | 'phrase'>> = {
  masterpiece: { symbol: '!!!', glyph: '!!!', icon: 'crown', color: '#6A5FB4' },
  brilliant: { symbol: '!!', glyph: '!!', icon: 'sparkles', color: '#2FA3A6' },
  great: { symbol: '!', glyph: '!', icon: 'target', color: '#3F6FC4' },
  best: { symbol: '★', icon: 'star', color: '#C99A22' },
  excellent: { symbol: '✓', icon: 'check', color: '#C0784A' },
  good: { symbol: '✓', icon: 'trend-check', color: '#4E9A47' },
  book: { symbol: 'Book', icon: 'book', color: '#7A5137' },
  forced: { symbol: '→', icon: 'arrow', color: '#6E7681' },
  inaccuracy: { symbol: '?!', glyph: '?!', icon: 'trend-down', color: '#E0B83C' },
  mistake: { symbol: '?', glyph: '?', icon: 'cross', color: '#E07B2C' },
  miss: { symbol: '✕', icon: 'crossed-arrows', color: '#5E8DAA' },
  blunder: { symbol: '??', glyph: '??', icon: 'bolt', color: '#C93A33' },
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
      ...(c === 'book'
        ? {
            get symbol() {
              return translate('moveClass.book.symbol');
            },
          }
        : null),
    },
  ]),
) as Record<MoveClass, MoveClassStyle>;

export const REVIEW_ORDER: MoveClass[] = ['masterpiece', 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** "+0.4", "-M3", or "#" for a position that is already mate. */
export function formatEval(score: Score): string {
  if (isMatedScore(score)) return (score.cp ?? 0) > 0 ? '1-0' : '0-1';
  return formatScore(score);
}

/** Engine arrows: dark ink over the greyscale board, fading for weaker lines. */
export const ARROW_COLORS = ['rgba(12, 12, 14, 0.78)', 'rgba(12, 12, 14, 0.42)', 'rgba(12, 12, 14, 0.26)'];
export const BEST_MOVE_ARROW = 'rgba(47, 158, 107, 0.85)';
