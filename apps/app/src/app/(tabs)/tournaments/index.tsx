import Ionicons from '@expo/vector-icons/Ionicons';
import { useWindowDimensions, View } from 'react-native';

import { Page } from '@/components/shell/Page';
import { TournamentCard } from '@/features/tournaments/ui';
import { useT } from '@/i18n';
import { usePolling, useTournamentsApi } from '@/lib/tournamentsApi';
import { Button, GlassView, SectionHeader, Skeleton, Stack, Text, useAppTheme } from '@/ui';

/** The Tournaments tab: live, upcoming and recent tournaments. */
export default function Tournaments() {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  const api = useTournamentsApi();
  const { data, error, loading, reload } = usePolling(() => api.list(), 15_000, [api]);
  const { width } = useWindowDimensions();
  const content = width >= 960 ? width - 250 : width;
  const cols = content >= 900 ? 2 : 1;
  const sections = data
    ? ([
        ['live', data.live],
        ['upcoming', data.upcoming],
        ['finished', data.finished],
      ] as const)
    : [];
  const nothing = data && data.live.length + data.upcoming.length + data.finished.length === 0;
  let index = 0;
  return (
    <Page maxWidth={1080}>
      <View style={{ gap: t.space.sm, paddingTop: 12 }}>
        <Text variant="overline" tone="muted">
          {tr('tournaments.overline')}
        </Text>
        <Text variant="display" style={width < 420 && { fontSize: 32, lineHeight: 38 }}>
          {tr('tournaments.title')}
        </Text>
        <Text tone="muted" style={{ maxWidth: 560 }}>
          {tr('tournaments.heroBody')}
        </Text>
      </View>

      {error && !data ? (
        <GlassView radius="xl" padding="lg" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Text variant="bodyStrong">{tr('tournaments.load')}</Text>
          <Text tone="muted">{error}</Text>
          <Button title={tr('tournaments.retry')} variant="secondary" size="sm" onPress={reload} />
        </GlassView>
      ) : loading && !data ? (
        <Stack gap="md">
          <Skeleton height={132} radius="xl" />
          <Skeleton height={132} radius="xl" />
        </Stack>
      ) : nothing ? (
        <GlassView radius="xl" padding="xl" style={{ alignItems: 'center', gap: 10 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trophy-outline" size={24} color={c.text} />
          </View>
          <Text variant="heading">{tr('tournaments.empty.title')}</Text>
          <Text tone="muted" align="center" style={{ maxWidth: 380 }}>
            {tr('tournaments.empty.body')}
          </Text>
        </GlassView>
      ) : (
        sections.map(([key, list]) => {
          if (list.length === 0 && key !== 'upcoming') return null;
          index += 1;
          return (
            <View key={key} style={{ gap: t.space.md }}>
              <SectionHeader index={index} title={tr(`tournaments.sections.${key}`)} />
              {list.length === 0 ? (
                <Text tone="muted" style={{ paddingHorizontal: 2 }}>
                  {tr('tournaments.noUpcoming')}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md }}>
                  {list.map((x) => (
                    <View key={x.id} style={{ width: cols === 2 ? '48.9%' : '100%', flexGrow: 1 }}>
                      <TournamentCard t={x} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </Page>
  );
}
