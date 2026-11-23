import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { RoleTag } from '@chessmate/core';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Text, useAppTheme } from '@/ui';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** One icon per official tag, so the tag reads at a glance even without its label. */
export const ROLE_TAG_ICONS: Record<RoleTag, IconName> = {
  staff: 'shield-crown',
  moderator: 'shield-check',
  streamer: 'broadcast',
  coach: 'school',
  arbiter: 'whistle',
  creator: 'pencil-circle',
  ambassador: 'earth',
};

/**
 * Official role tag next to a player's name ("ChessMate staff", "Streamer").
 * Admin-assigned, so it is drawn as a solid monochrome seal rather than a
 * glass chip like player-chosen decorations. `compact` shows only the icon.
 */
export function RoleTagBadge({ tag, compact, size = 'sm' }: { tag: RoleTag | null | undefined; compact?: boolean; size?: 'sm' | 'md' }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  if (!tag) return null;
  const label = tr(`chessTitle.roleTags.${tag}`);
  const h = size === 'sm' ? 20 : 26;
  const icon = size === 'sm' ? 13 : 16;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.tag,
        { height: h, minWidth: h, borderRadius: h / 2, backgroundColor: c.accent, paddingHorizontal: compact ? 0 : size === 'sm' ? 7 : 10 },
        compact && { width: h },
      ]}>
      <MaterialCommunityIcons name={ROLE_TAG_ICONS[tag]} size={icon} color={c.onAccent} />
      {!compact && (
        <Text variant={size === 'sm' ? 'caption' : 'label'} color={c.onAccent} numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 },
  label: { fontWeight: '700' },
});
