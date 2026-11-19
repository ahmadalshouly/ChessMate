import { formatTimeControl, timeCategory, type TournamentSummary } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTicker } from '@/components/PlayerBar';
import { Page } from '@/components/shell/Page';
import { tournamentClock } from '@/features/tournaments/format';
import { formatNumber, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { tournamentsApi } from '@/lib/tournamentsApi';
import { Badge, GlassView, SectionHeader, Text, useAppTheme } from '@/ui';

/**
 * The Tournaments tab: arenas running now, coming up and finished. Staff
 * create them in the admin console; anyone with an account can join.
 */
export default function Tournaments() {
  const t = useAppTheme();
  const tr = useT();
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = list?.some((x) => x.status === 'running' || x.status === 'scheduled') ?? false;
  useTicker(running);

  const load = useCallback(() => {
    tournamentsApi.list().then(
      (r) => {
        setList(r.tournaments);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 15_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const live = list?.filter((x) => x.status === 'running') ?? [];
  const upcoming = list?.filter((x) => x.status === 'scheduled') ?? [];
  const past = list?.filter((x) => x.status === 'finished' || x.status === 'cancelled').slice(0, 20) ?? [];

  return (
    <Page>
      <View style={{ gap: t.space.sm }}>
        <Text variant="display">{tr('tournaments.title')}</Text>
        <Text tone="muted" style={{ maxWidth: 560 }}>
          {tr('tournaments.intro')}
        </Text>
      </View>
      {error && (
        <GlassView padding="md" radius="lg" style={{ borderColor: t.colors.danger, borderWidth: 1 }}>
          <Text tone="danger">{serverText(error)}</Text>
        </GlassView>
      )}
      {list && list.length === 0 && (
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
          <Text variant="heading">{tr('tournaments.noneTitle')}</Text>
          <Text tone="muted">{tr('tournaments.noneBody')}</Text>
        </GlassView>
      )}
      {live.length > 0 && <Section title={tr('tournaments.live')} items={live} />}
      {upcoming.length > 0 && <Section title={tr('tournaments.upcoming')} items={upcoming} />}
      {past.length > 0 && <Section title={tr('tournaments.past')} items={past} />}
      <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
        <Text variant="label">{tr('tournaments.howTitle')}</Text>
        <Text tone="muted">{tr('tournaments.howBody')}</Text>
      </GlassView>
    </Page>
  );
}

function Section({ title, items }: { title: string; items: TournamentSummary[] }) {
  const t = useAppTheme();
  return (
    <View style={{ gap: t.space.md }}>
      <SectionHeader title={title} />
      <View style={{ gap: t.space.md }}>
        {items.map((x) => (
          <TournamentCard key={x.id} t={x} />
        ))}
      </View>
    </View>
  );
}

function TournamentCard({ t: x }: { t: TournamentSummary }) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const category = tr(`common.category.${timeCategory(x.timeControl)}`);
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: x.id } })}>
      {({ pressed }) => (
        <GlassView padding="lg" radius="xl" style={[styles.card, { opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.icon, { backgroundColor: x.status === 'running' ? c.accent : c.surfaceSunken, borderColor: c.borderStrong }]}>
            <Ionicons name="trophy" size={22} color={x.status === 'running' ? c.onAccent : c.text} />
          </View>
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Text variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
                {x.name}
              </Text>
              {x.status === 'running' && <Badge tone="live" size="sm" label={tr('tournaments.liveBadge')} />}
              {x.joined && <Badge tone="outline" size="sm" label={tr('tournaments.joinedBadge')} />}
            </View>
            <Text variant="caption" tone="muted">
              {formatTimeControl(x.timeControl)} · {category} · {x.rated ? tr('play.rated') : tr('play.casual')} · {tr('tournaments.minutes', { count: x.durationMinutes })}
            </Text>
            <Text variant="caption" tone="muted">
              {tournamentClock(x)} · {tr('tournaments.players', { count: x.players, n: formatNumber(x.players) })}
              {x.winner ? ` · ${tr('tournaments.winner', { name: x.winner })}` : ''}
            </Text>
            {x.prizePool ? (
              <View style={styles.titleRow}>
                <Ionicons name="gift-outline" size={14} color={c.text} />
                <Text variant="label" numberOfLines={1}>
                  {x.prizePool}
                </Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </GlassView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
});
