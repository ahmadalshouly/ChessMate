import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { EventDetail } from '@chessmate/core';
import { Stack as RouterStack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTicker } from '@/components/PlayerBar';
import { EventCard, GameThumb, StatusPill, StreamerCard } from '@/features/watch/components';
import { useT } from '@/i18n';
import { usePolled, watchApi, type WatchMe } from '@/lib/watchApi';
import { Button, GlassView, Row, Screen, SectionHeader, Skeleton, Stack, Text, useAppTheme } from '@/ui';

/**
 * Watch: live broadcast events (with the featured event's boards), streamers,
 * upcoming and recent events, and the way in for organisers.
 */
export default function WatchScreen() {
  const tr = useT();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const events = usePolled(watchApi.events, { fastMs: 20_000, slowMs: 60_000, isLive: (d) => d.live.length > 0 });
  const streamers = usePolled(watchApi.streamers, { fastMs: 30_000, slowMs: 60_000 });
  const [me, setMe] = useState<WatchMe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    watchApi.me().then(setMe, () => {});
  }, []);

  // The first live event (featured ones first) shows its boards here.
  const top = events.data?.live[0] ?? null;
  const topId = top?.id ?? null;
  const loadTop = useCallback(() => watchApi.event(topId!), [topId]);
  const topDetail = usePolled<EventDetail>(top ? loadTop : null, { fastMs: 6_000, slowMs: 30_000, isLive: (d) => d.status === 'live' });
  const round = topDetail.data?.rounds.find((r) => r.id === topDetail.data?.currentRound?.id);
  const boards = (round?.games ?? []).filter((g) => g.status !== 'notStarted').slice(0, 4);
  const now = useTicker(boards.some((g) => g.status === 'live'));

  const liveStreamers = (streamers.data ?? []).filter((s) => s.live);
  const otherStreamers = (streamers.data ?? []).filter((s) => !s.live);
  const thumb = Math.min(220, Math.floor((Math.min(width, 1100) - 64) / (width > 720 ? 4 : 2)));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([events.refresh(), streamers.refresh(), topDetail.refresh()]);
    setRefreshing(false);
  };

  const data = events.data;
  const empty = data && !data.live.length && !data.upcoming.length && !data.recent.length;

  return (
    <Screen scroll width="wide" scrollProps={{ refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} /> }}>
      <RouterStack.Screen options={{ title: tr('watch.screenTitle') }} />

      {me?.isAdmin || me?.canReviewStreamers ? (
        <Row gap="sm" wrap>
          {me.isAdmin && <Button title={tr('watch.admin.broadcasts')} variant="secondary" size="sm" onPress={() => router.push('/admin/broadcasts')} />}
          {me.canReviewStreamers && <Button title={tr('watch.admin.streamers')} variant="secondary" size="sm" onPress={() => router.push('/admin/streamers')} />}
        </Row>
      ) : null}

      {/* Featured live event with its boards */}
      {top && (
        <Stack gap="sm">
          <SectionHeader title={tr('watch.liveNow')} />
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <Row justify="space-between" gap="md">
              <Stack gap="xxs" style={{ flex: 1 }}>
                <StatusPill status="live" />
                <Text variant="title" numberOfLines={2}>
                  {top.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {[round?.name, top.location].filter(Boolean).join(' · ')}
                </Text>
              </Stack>
              <Button title={tr('watch.openEvent')} variant="secondary" size="sm" onPress={() => router.push(`/watch/events/${top.id}`)} />
            </Row>
            {boards.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.lg }}>
                {boards.map((g) => (
                  <GameThumb key={g.id} g={g} size={thumb} now={now} />
                ))}
              </ScrollView>
            ) : (
              topDetail.loading && <Skeleton height={thumb} radius="lg" />
            )}
          </GlassView>
        </Stack>
      )}

      {/* Streamers */}
      <Stack gap="sm">
        <SectionHeader title={tr('watch.streamers')} action={<Button title={tr('watch.seeAll')} variant="ghost" size="sm" onPress={() => router.push('/watch/streamers')} />} />
        {streamers.data && streamers.data.length === 0 ? (
          <GlassView padding="lg" radius="lg">
            <Text tone="muted">{tr('watch.noStreamers')}</Text>
          </GlassView>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.space.md }}>
            {[...liveStreamers, ...otherStreamers].slice(0, 10).map((s) => (
              <StreamerCard key={s.userId} s={s} compact />
            ))}
          </ScrollView>
        )}
        {liveStreamers.length === 0 && streamers.data && streamers.data.length > 0 && (
          <Text variant="caption" tone="muted">
            {tr('watch.noLiveStreamers')}
          </Text>
        )}
      </Stack>

      {/* Events */}
      {!data && events.loading && <Skeleton height={120} radius="lg" />}
      {events.error && !data && (
        <GlassView padding="lg" radius="lg" style={{ gap: t.space.md }}>
          <Text tone="muted">{tr('watch.loadFailed', { reason: events.error })}</Text>
          <Button title={tr('common.tryAgain')} variant="secondary" onPress={() => void events.refresh()} />
        </GlassView>
      )}
      {data && data.managed.length > 0 && (
        <EventList title={tr('watch.yourEvents')} items={data.managed} manage />
      )}
      {data && data.live.length > 0 && <EventList title={tr('watch.liveEvents')} items={data.live} />}
      {data && data.upcoming.length > 0 && <EventList title={tr('watch.upcoming')} items={data.upcoming} />}
      {data && data.recent.length > 0 && <EventList title={tr('watch.recent')} items={data.recent} />}
      {empty && (
        <GlassView padding="lg" radius="lg">
          <Text tone="muted">{tr('watch.noEvents')}</Text>
        </GlassView>
      )}

      {/* Organisers */}
      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Row gap="md">
          <View style={[styles.icon, { backgroundColor: t.colors.surfaceSunken }]}>
            <MaterialCommunityIcons name="broadcast" size={24} color={t.colors.text} />
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="bodyStrong">{tr('watch.broadcastYours')}</Text>
            <Text variant="caption" tone="muted">
              {tr('watch.broadcastYoursBody')}
            </Text>
          </Stack>
        </Row>
        <Button title={tr('watch.apply.cta')} variant="secondary" onPress={() => router.push('/watch/apply')} />
      </GlassView>
    </Screen>
  );
}

function EventList({ title, items, manage }: { title: string; items: import('@chessmate/core').EventSummary[]; manage?: boolean }) {
  const t = useAppTheme();
  return (
    <Stack gap="sm">
      <SectionHeader title={title} />
      <View style={[styles.grid, { gap: t.space.md }]}>
        {items.map((e) => (
          <View key={e.id} style={styles.cell}>
            <EventCard e={e} onPress={manage ? () => router.push(`/watch/manage/${e.id}`) : undefined} />
          </View>
        ))}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexGrow: 1, flexBasis: 320, maxWidth: 560 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
