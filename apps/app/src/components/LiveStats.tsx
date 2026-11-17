import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useServerStats } from '@/lib/leaderboardApi';
import { GlassView, Text, useAppTheme } from '@/ui';

/** Glass strip on the home screen: players online, games in progress, players looking for a game. */
export function LiveStats() {
  const t = useAppTheme();
  const c = t.colors;
  const { stats, offline } = useServerStats();
  const narrow = useWindowDimensions().width < 520;
  const items = [
    { label: 'Online', value: stats?.playersOnline },
    { label: 'Playing', value: stats?.gamesInProgress },
    { label: 'Seeking', value: stats?.playersSeeking },
  ];
  return (
    <GlassView radius="xl" style={styles.strip}>
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: offline ? c.danger : stats ? c.live : c.textTertiary }]} />
        {!narrow && (
          <Text variant="overline" tone="muted">
            {offline ? 'Server offline' : 'Live'}
          </Text>
        )}
      </View>
      {items.map((it) => (
        <View key={it.label} style={[styles.item, { borderLeftColor: c.border }]} accessible accessibilityLabel={`${it.label}: ${it.value ?? 'unknown'}`}>
          <Text variant="figure">{it.value === undefined ? '–' : it.value.toLocaleString()}</Text>
          <Text variant="overline" tone="tertiary">
            {it.label}
          </Text>
        </View>
      ))}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18, gap: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  item: { flex: 1, gap: 2, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 16 },
});
