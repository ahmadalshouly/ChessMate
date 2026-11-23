import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { PlayerTag } from '@chessmate/core';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const PLAYER_TAG_ICONS: Record<PlayerTag, IconName> = {
  learner: 'sprout',
  casual: 'coffee',
  competitive: 'trophy-outline',
  tactician: 'lightning-bolt-outline',
  positional: 'chess-pawn',
  endgame: 'flag-checkered',
  openings: 'book-open-variant',
  speed: 'timer-outline',
  nightOwl: 'weather-night',
  puzzles: 'puzzle-outline',
  coachable: 'account-voice',
  veteran: 'star-outline',
};

/**
 * The tag a player picked for themselves. Drawn as an outline chip, unlike the
 * solid seal of official role tags, so the two never look alike.
 */
export function PlayerTagBadge({ tag, compact, size = 'sm' }: { tag: PlayerTag | null | undefined; compact?: boolean; size?: 'sm' | 'md' }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  if (!tag) return null;
  const label = tr(`profile.tags.${tag}`);
  const h = size === 'sm' ? 20 : 26;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.tag, { height: h, minWidth: h, borderRadius: h / 2, borderColor: c.borderStrong, paddingHorizontal: compact ? 0 : size === 'sm' ? 7 : 10 }, compact && { width: h }]}>
      <MaterialCommunityIcons name={PLAYER_TAG_ICONS[tag]} size={size === 'sm' ? 12 : 15} color={c.text} />
      {!compact && (
        <Text variant={size === 'sm' ? 'caption' : 'label'} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0, borderWidth: StyleSheet.hairlineWidth * 2 },
});
