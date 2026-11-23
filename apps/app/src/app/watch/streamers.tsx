import { Stack as RouterStack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StreamerCard } from '@/features/watch/components';
import { useT } from '@/i18n';
import { usePolled, watchApi } from '@/lib/watchApi';
import { Button, GlassView, Screen, SectionHeader, Skeleton, Stack, Text, useAppTheme } from '@/ui';

/** All approved streamers, live ones first. */
export default function StreamersScreen() {
  const tr = useT();
  const t = useAppTheme();
  const { data, error, loading, refresh } = usePolled(watchApi.streamers, { fastMs: 30_000, slowMs: 60_000 });
  const live = (data ?? []).filter((s) => s.live);
  const rest = (data ?? []).filter((s) => !s.live);
  return (
    <Screen scroll width="wide">
      <RouterStack.Screen options={{ title: tr('watch.streamers') }} />
        {!data && loading && <Skeleton height={120} radius="lg" />}
        {error && !data && (
          <GlassView padding="lg" radius="lg" style={{ gap: t.space.md }}>
            <Text tone="muted">{tr('watch.loadFailed', { reason: error })}</Text>
            <Button title={tr('common.tryAgain')} variant="secondary" onPress={() => void refresh()} />
          </GlassView>
        )}
        {data && data.length === 0 && (
          <GlassView padding="lg" radius="lg">
            <Text tone="muted">{tr('watch.noStreamers')}</Text>
          </GlassView>
        )}
        {live.length > 0 && <Group title={tr('watch.liveNow')} items={live} />}
        {rest.length > 0 && <Group title={tr('watch.allStreamers')} items={rest} />}
    </Screen>
  );
}

function Group({ title, items }: { title: string; items: import('@chessmate/core').StreamerView[] }) {
  return (
    <Stack gap="sm">
      <SectionHeader title={title} />
      <View style={styles.grid}>
        {items.map((s) => (
          <View key={s.userId} style={styles.cell}>
            <StreamerCard s={s} />
          </View>
        ))}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { flexGrow: 1, flexBasis: 300, maxWidth: 520 },
});
