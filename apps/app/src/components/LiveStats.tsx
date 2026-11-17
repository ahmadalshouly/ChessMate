import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useServerStats } from '@/lib/leaderboardApi';
import { formatNumber, useT } from '@/i18n';

/** Glass strip on the home screen: players online, games in progress, players looking for a game. */
export function LiveStats() {
  const t = useTheme();
  const tr = useT();
  const { stats, offline } = useServerStats();
  const items = [
    { label: tr('home.stats.online'), value: stats?.playersOnline },
    { label: tr('home.stats.games'), value: stats?.gamesInProgress },
    { label: tr('home.stats.seeking'), value: stats?.playersSeeking },
  ];
  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: offline ? t.danger : stats ? '#2FBF71' : t.muted }]} />
        <Text style={[styles.caption, { color: t.muted }]}>{offline ? tr('home.stats.offline') : tr('home.stats.live')}</Text>
      </View>
      <View style={styles.row}>
        {items.map((it) => (
          <View key={it.label} style={styles.item} accessible accessibilityLabel={`${it.label}: ${it.value ?? '–'}`}>
            <Text style={[styles.value, { color: t.text }]}>{it.value === undefined ? '–' : formatNumber(it.value)}</Text>
            <Text style={[styles.label, { color: t.muted }]} numberOfLines={2}>
              {it.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, gap: 2 },
  value: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  label: { fontSize: 13 },
});
