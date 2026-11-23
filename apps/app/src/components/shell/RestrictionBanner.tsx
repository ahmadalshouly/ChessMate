import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { dirIcon, useT } from '@/i18n';
import { usePlay } from '@/lib/playClient';
import { GlassView, Text, useAppTheme } from '@/ui';

/**
 * Shown on every screen while the account is closed for fair play: the player
 * can still sign in, look at games, puzzles and analysis, but cannot play online.
 * Tapping it opens the notification with the full explanation.
 */
export function RestrictionBanner({ style }: { style?: object }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { restricted } = usePlay();
  if (!restricted) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${tr('server.restriction.title')}. ${tr('server.restriction.body')}`} onPress={() => router.push('/notifications')} style={style}>
      {({ pressed }) => (
        <GlassView radius="lg" padding="md" elevation="none" style={[styles.box, { borderColor: c.danger, opacity: pressed ? 0.8 : 1 }]}>
          <Ionicons name="shield-outline" size={20} color={c.danger} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label" color={c.danger}>
              {tr('server.restriction.title')}
            </Text>
            <Text variant="caption" tone="muted">
              {tr('server.restriction.body')}
            </Text>
          </View>
          <Ionicons name={dirIcon('chevron-forward')} size={16} color={c.muted} />
        </GlassView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
});
