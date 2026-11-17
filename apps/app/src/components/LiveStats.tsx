import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useServerStats } from '@/lib/leaderboardApi';
import { GlassView, Text, useAppTheme } from '@/ui';
import { formatNumber, useT } from '@/i18n';

/** Glass strip on the home screen: players online, games in progress, players looking for a game. */
export function LiveStats() {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { stats, offline } = useServerStats();
  const narrow = useWindowDimensions().width < 520;
  const items = [
    { label: tr('home.stats.online'), value: stats?.playersOnline },
    { label: tr('home.stats.games'), value: stats?.gamesInProgress },
    { label: tr('home.stats.seeking'), value: stats?.playersSeeking },
  ];
  return (
    <GlassView radius="xl" style={styles.strip}>
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: offline ? c.danger : stats ? c.live : c.textTertiary }]} />
        {!narrow && (
          <Text variant="overline" tone="muted">
            {offline ? tr('home.stats.offline') : tr('home.stats.live')}
          </Text>
        )}
      </View>
      {items.map((it) => (
        <View key={it.label} style={[styles.item, { borderStartColor: c.border }]} accessible accessibilityLabel={`${it.label}: ${it.value ?? '–'}`}>
          <Text variant="figure">{it.value === undefined ? '–' : formatNumber(it.value)}</Text>
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
  item: { flex: 1, gap: 2, borderStartWidth: StyleSheet.hairlineWidth, paddingStart: 16 },
});
