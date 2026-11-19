import { formatTimeControl, timeCategory, type TournamentDetail } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useTicker } from '@/components/PlayerBar';
import { formatDateTime, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { usePlay } from '@/lib/playClient';
import { useSocialIdentity } from '@/lib/social/session';
import { tournamentsApi } from '@/lib/tournamentsApi';
import { Badge, Button, GlassView, ListGroup, ListRow, SectionHeader, Text, useAppTheme } from '@/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';

import { tournamentClock } from '@/features/tournaments/format';

/**
 * One tournament: schedule, prizes, join or pause, your current game and the
 * live standings. While it runs, the server pairs you as soon as you are free;
 * your game opens on its own.
 */
export default function TournamentScreen() {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSocialIdentity();
  const play = usePlay();
  const [tour, setTour] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useTicker(tour?.status === 'running' || tour?.status === 'scheduled');

  const load = useCallback(() => {
    if (!id) return;
    tournamentsApi.get(id).then(
      (r) => {
        setTour(r.tournament);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 3_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  // The server paired you: open the game.
  const liveGame = play.game && !play.game.outcome && play.game.tournamentId === id ? play.game.gameId : null;
  useEffect(() => {
    if (liveGame) router.push('/play/online');
  }, [liveGame]);

  const act = (fn: () => Promise<{ tournament: TournamentDetail }>) => async () => {
    setBusy(true);
    try {
      setTour((await fn()).tournament);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!tour) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Stack.Screen options={{ title: tr('tournaments.title') }} />
        {error ? <Text tone="danger">{serverText(error)}</Text> : <Text tone="muted">{tr('common.loading')}</Text>}
      </View>
    );
  }

  const open = tour.status === 'scheduled' || tour.status === 'running';
  const category = tr(`common.category.${timeCategory(tour.timeControl)}`);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: tour.name }} />
      <View style={[styles.inner, { gap: t.space.xl }]}>
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <View style={styles.row}>
            {tour.status === 'running' && <Badge tone="live" label={tr('tournaments.liveBadge')} />}
            {tour.status === 'scheduled' && <Badge tone="outline" label={tr('tournaments.upcomingBadge')} />}
            {tour.status === 'finished' && <Badge label={tr('tournaments.finishedBadge')} />}
            {tour.status === 'cancelled' && <Badge tone="danger" label={tr('tournaments.cancelled')} />}
            <Text variant="caption" tone="muted">
              {tournamentClock(tour)}
            </Text>
          </View>
          <Text variant="title">{tour.name}</Text>
          {tour.description ? <Text tone="muted">{tour.description}</Text> : null}
          <View style={styles.facts}>
            <Fact icon="time-outline" label={`${formatTimeControl(tour.timeControl)} · ${category}`} />
            <Fact icon="stats-chart-outline" label={tour.rated ? tr('play.rated') : tr('play.casual')} />
            <Fact icon="hourglass-outline" label={tr('tournaments.minutes', { count: tour.durationMinutes })} />
            <Fact icon="calendar-outline" label={formatDateTime(tour.startsAt)} />
            <Fact icon="people-outline" label={tour.maxPlayers ? tr('tournaments.playersOf', { n: tour.players, max: tour.maxPlayers }) : tr('tournaments.players', { count: tour.players, n: tour.players })} />
          </View>
          {error && <Text tone="danger">{serverText(error)}</Text>}
          {open && me && (
            <View style={styles.row}>
              {tour.joined ? (
                <>
                  {tour.yourGameId ? (
                    <Button title={tr('tournaments.toGame')} onPress={() => router.push('/play/online')} rightIcon={<Ionicons name="arrow-forward" size={16} color={c.onAccent} />} />
                  ) : tour.status === 'running' ? (
                    <Text variant="label">{tr('tournaments.waitingPairing')}</Text>
                  ) : (
                    <Text variant="label">{tr('tournaments.joinedWait')}</Text>
                  )}
                  <Button variant="secondary" size="sm" title={tour.status === 'running' ? tr('tournaments.pause') : tr('tournaments.leave')} disabled={busy} onPress={act(() => tournamentsApi.withdraw(tour.id))} />
                </>
              ) : (
                <Button title={tr('tournaments.join')} disabled={busy || !!play.restricted} onPress={act(() => tournamentsApi.join(tour.id))} />
              )}
            </View>
          )}
          {open && !me && (
            <Button variant="secondary" title={tr('tournaments.signInToJoin')} onPress={() => router.push({ pathname: '/sign-in', params: { next: `/tournaments/${tour.id}` } })} />
          )}
        </GlassView>

        {(tour.prizePool || tour.prizes.length > 0) && (
          <View style={{ gap: t.space.md }}>
            <SectionHeader title={tr('tournaments.prizes')} />
            <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
              {tour.prizePool ? (
                <View style={styles.row}>
                  <Ionicons name="gift-outline" size={18} color={c.text} />
                  <Text variant="heading">{tour.prizePool}</Text>
                </View>
              ) : null}
              {tour.prizes.map((p) => (
                <View key={p.place} style={styles.prize}>
                  <Text variant="numeric" tone="muted" style={{ width: 56 }}>
                    {tr('tournaments.place', { n: p.place })}
                  </Text>
                  <Text style={{ flex: 1 }}>{p.prize}</Text>
                </View>
              ))}
            </GlassView>
          </View>
        )}

        {tour.liveGames.length > 0 && (
          <View style={{ gap: t.space.md }}>
            <SectionHeader title={tr('tournaments.liveGames')} action={<Badge tone="live" size="sm" label={tour.liveGames.length} />} />
            <ListGroup>
              {tour.liveGames.slice(0, 10).map((g) => (
                <ListRow key={g.gameId} title={`${g.white} – ${g.black}`} chevron onPress={() => router.push(`/watch/${g.gameId}`)} />
              ))}
            </ListGroup>
          </View>
        )}

        <View style={{ gap: t.space.md }}>
          <SectionHeader title={tr('tournaments.standings')} />
          {tour.standings.length === 0 ? (
            <GlassView padding="lg" radius="xl">
              <Text tone="muted">{tr('tournaments.noPlayers')}</Text>
            </GlassView>
          ) : (
            <ListGroup>
              {tour.standings.map((s) => (
                <ListRow
                  key={s.userId}
                  left={
                    <Text variant="numeric" tone={s.rank <= 3 ? 'default' : 'muted'} style={{ width: 28, textAlign: 'center' }}>
                      {s.rank}
                    </Text>
                  }
                  title={`${s.username}${s.userId === me?.userId ? ` (${tr('messages.you')})` : ''}`}
                  subtitle={`${s.rating} · ${tr('tournaments.record', { w: s.wins, d: s.draws, l: s.losses })}${s.playing ? ` · ${tr('tournaments.playingNow')}` : ''}${s.withdrawn ? ` · ${tr('tournaments.paused')}` : ''}`}
                  right={
                    <View style={styles.row}>
                      {s.onFire && <Ionicons name="flame" size={16} color={c.warning} accessibilityLabel={tr('tournaments.onFire')} />}
                      <Text variant="figure" style={{ fontSize: 20, lineHeight: 24 }}>
                        {s.score}
                      </Text>
                    </View>
                  }
                />
              ))}
            </ListGroup>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Fact({ icon, label }: { icon: ComponentProps<typeof Ionicons>['name']; label: string }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.fact, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
      <Ionicons name={icon} size={14} color={c.text} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center', paddingBottom: 40 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
