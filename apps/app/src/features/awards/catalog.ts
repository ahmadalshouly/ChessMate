import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AWARDS_BY_ID, tierOf, type AwardCategory, type AwardDefinition, type AwardTier } from '@chessmate/core';
import type { ComponentProps } from 'react';

import { translate } from '@/i18n';

export type AwardIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Medal colours per level; locked awards use the theme's muted colour. */
export const TIER_COLORS: Record<AwardTier, string> = {
  bronze: '#B8743B',
  silver: '#9AA4AE',
  gold: '#D4A21A',
  platinum: '#5FB3B3',
  diamond: '#6C8CFF',
};

export const tierColor = (level: number) => TIER_COLORS[tierOf(level)];
export const tierName = (level: number) => translate(`awards.tiers.${tierOf(level)}`);

const CATEGORY_ICONS: Record<AwardCategory, AwardIcon> = {
  openings: 'book-open-page-variant',
  ratings: 'chart-line',
  countries: 'earth',
  checkmates: 'chess-king',
  milestones: 'trophy-outline',
};

const ICONS: Record<string, AwardIcon> = {
  'openings.explorer': 'compass-outline',
  'countries.played': 'earth',
  'countries.beaten': 'flag-checkered',
  'mates.total': 'crown-outline',
  'games.played': 'counter',
  'games.won': 'trophy-outline',
  'mate.backRank': 'border-bottom-variant',
  'mate.smothered': 'chess-knight',
  'mate.doubleCheck': 'numeric-2-circle-outline',
  'mate.discovered': 'eye-outline',
  'mate.castling': 'castle',
  'mate.enPassant': 'arrow-bottom-right',
  'mate.promotion': 'arrow-up-bold-circle-outline',
  'mate.underpromotion': 'arrow-up-circle-outline',
  'mate.pawn': 'chess-pawn',
  'mate.knight': 'chess-knight',
  'mate.bishop': 'chess-bishop',
  'mate.rook': 'chess-rook',
  'mate.queen': 'chess-queen',
  'mate.king': 'chess-king',
  'mate.quick': 'lightning-bolt',
};

export function awardIcon(id: string): AwardIcon {
  const def = AWARDS_BY_ID.get(id);
  return ICONS[id] ?? (def ? CATEGORY_ICONS[def.category] : 'medal-outline');
}

export const categoryIcon = (c: AwardCategory) => CATEGORY_ICONS[c];

const timeCategoryName = (c: string) => translate(`common.category.${c as 'blitz'}`);

export function awardName(id: string): string {
  const def = AWARDS_BY_ID.get(id);
  if (!def) return id;
  const p = def.params;
  if (p.opening) return translate(`awards.openings.${p.opening}`);
  if (p.category) return translate('awards.items.rating.name', { category: timeCategoryName(p.category) });
  if (p.mate) return translate(`awards.mates.${p.mate}.name`);
  return translate(`awards.items.${itemKey(def)}.name`);
}

/** What one level asks for, e.g. "Win 10 games in the Sicilian Defence". */
export function awardGoal(id: string, threshold: number): string {
  const def = AWARDS_BY_ID.get(id);
  if (!def) return '';
  const p = def.params;
  if (p.opening) return translate('awards.items.opening.desc', { count: threshold, opening: translate(`awards.openings.${p.opening}`) });
  if (p.category) return translate('awards.items.rating.desc', { count: threshold, category: timeCategoryName(p.category) });
  if (p.mate) return translate(`awards.mates.${p.mate}.desc`, { count: threshold });
  return translate(`awards.items.${itemKey(def)}.desc`, { count: threshold });
}

type ItemKey = 'explorer' | 'countriesPlayed' | 'countriesBeaten' | 'matesTotal' | 'gamesPlayed' | 'gamesWon';

function itemKey(def: AwardDefinition): ItemKey {
  const keys: Record<string, ItemKey> = {
    'openings.explorer': 'explorer',
    'countries.played': 'countriesPlayed',
    'countries.beaten': 'countriesBeaten',
    'mates.total': 'matesTotal',
    'games.played': 'gamesPlayed',
    'games.won': 'gamesWon',
  };
  return keys[def.id] ?? 'gamesPlayed';
}

/** "Sicilian Defence · Gold" */
export const earnedLabel = (id: string, level: number) => `${awardName(id)} · ${tierName(level)}`;
