import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney, formatTimeControl, timeCategory, type TournamentDetail } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { useTicker } from '@/components/PlayerBar';
import { formatDateTime, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { usePlay } from '@/lib/playClient';
import { useSocialIdentity } from '@/lib/social/session';
import { tournamentsApi } from '@/lib/tournamentsApi';
import { Badge, Button, GlassView, ListGroup, ListRow, SectionHeader, Tabs, Text, useAppTheme } from '@/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';

import { formatLabel, formatScore, scoringRules, settingsOf, tournamentClock } from '@/features/tournaments/format';
import { JoinSheet } from '@/features/tournaments/JoinSheet';
import { PayoutSheet } from '@/features/tournaments/PayoutSheet';
import { SponsorBadge } from '@/features/tournaments/SponsorBadge';
import { TournamentChat } from '@/features/tournaments/TournamentChat';
import { TournamentResults } from '@/features/tournaments/TournamentResults';
import { useTournamentChat } from '@/features/tournaments/useTournamentChat';
import { webLink } from '@/lib/links';
import { KeyboardScrollView } from '@/ui/components/Keyboard';

/**
 * One tournament: schedule, prizes, join or pause, your current game and the
 * live standings. While it runs, the server pairs you as soon as you are free;
 * your game opens on its own.
 */
export default function TournamentScreen() {
  const insets = useSafeAreaInsets();
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const me = useSocialIdentity();
  const play = usePlay();
  const [tour, setTour] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [payout, setPayout] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [allResults, setAllResults] = useState(false);
  const [tab, setTab] = useState<'standings' | 'results' | 'chat'>('standings');
  // The chat is live; the tab shows how many messages came in since it was last open.
  const chat = useTournamentChat(id);
  const [chatSeen, setChatSeen] = useState(0);
  const changeTab = (next: typeof tab) => {
    // Opening or leaving the chat marks what is there as read.
    if (tab === 'chat' || next === 'chat') setChatSeen(chat.messages.length);
    setTab(next);
  };
  const unread = tab === 'chat' ? 0 : Math.max(0, chat.messages.length - chatSeen);
  const now = useTicker(tour?.status === 'running' || tour?.status === 'scheduled');

  const load = useCallback(() => {
    if (!id) return;
    tournamentsApi.get(id).then(
      (r) => {
        setTour(r.tournament);
        setPaymentsEnabled(r.paymentsEnabled);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  // Standings move fast only while it runs; before and after, a slow refresh is plenty.
  const running = tour?.status === 'running';
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, running ? 5_000 : 30_000);
      return () => clearInterval(timer);
    }, [load, running]),
  );

  // The server paired you: open the game. Only from this page while it is on
  // screen: when the game screen is already open, it switches to the new game
  // itself, so finished games do not pile up as screens with result cards.
  const focused = useIsFocused();
  const liveGame = play.game && !play.game.outcome && play.game.tournamentId === id ? play.game.gameId : null;
  useEffect(() => {
    if (liveGame && focused) router.navigate('/play/online');
  }, [liveGame, focused]);

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
  const fee = tour.entryFeeCents > 0 ? formatMoney(tour.entryFeeCents, tour.currency) : null;
  const web = Platform.OS === 'web';
  const pageOnWeb = webLink(`/tournaments/${tour.id}`);
  const prize = tour.you?.prizePlace ? tour.prizes.find((p) => p.place === tour.you!.prizePlace) : undefined;

  const accept = async () => {
    setBusy(true);
    try {
      if (fee) {
        // Entry fees are paid with Stripe on the web; the payment page sends the player back here.
        const { url } = await tournamentsApi.checkout(tour.id, pageOnWeb ?? `${window.location.origin}/tournaments/${tour.id}`);
        window.location.href = url;
        return;
      }
      setTour((await tournamentsApi.join(tour.id)).tournament);
      setJoining(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJoining(false);
    } finally {
      setBusy(false);
    }
  };
  const requirements = [
    tour.minRating !== null ? tr('tournaments.minRating', { n: tour.minRating }) : null,
    tour.maxRating !== null ? tr('tournaments.maxRating', { n: tour.maxRating }) : null,
    tour.minRatedGames > 0 ? tr('tournaments.minGames', { count: tour.minRatedGames }) : null,
    !tour.lateJoin ? tr('tournaments.noLateJoin') : null,
  ].filter((x): x is string => !!x);
  const category = tr(`common.category.${timeCategory(tour.timeControl)}`);
  const settings = settingsOf(tour);

  return (
    <KeyboardScrollView contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]}>
      <Stack.Screen options={{ title: tour.name }} />
      <View style={[styles.inner, { gap: t.space.xl }]}>
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <View style={styles.row}>
            {tour.status === 'running' && <Badge tone="live" label={tr('tournaments.liveBadge')} />}
            {tour.status === 'scheduled' && <Badge tone="outline" label={tr('tournaments.upcomingBadge')} />}
            {tour.status === 'finished' && <Badge label={tr('tournaments.finishedBadge')} />}
            {tour.status === 'cancelled' && <Badge tone="danger" label={tr('tournaments.cancelled')} />}
            {tour.private && <Badge tone="outline" label={tr('tournaments.private.badge')} icon={<Ionicons name="lock-closed" size={11} color={c.text} />} />}
            <Text variant="caption" tone="muted">
              {tournamentClock(tour, now)}
            </Text>
          </View>
          {tour.sponsor ? <SponsorBadge sponsor={tour.sponsor} size="lg" /> : null}
          <Text variant="title">{tour.name}</Text>
          {tour.description ? <Text tone="muted">{tour.description}</Text> : null}
          <View style={styles.facts}>
            <Fact icon={settings.format === 'swiss' ? 'git-network-outline' : 'flash-outline'} label={formatLabel(tour)} />
            <Fact icon="time-outline" label={`${formatTimeControl(tour.timeControl)} · ${category}`} />
            <Fact icon="stats-chart-outline" label={tour.rated ? tr('play.rated') : tr('play.casual')} />
            <Fact icon="hourglass-outline" label={tr('tournaments.minutes', { count: tour.durationMinutes })} />
            <Fact icon="flag-outline" label={settings.endMode === 'wait' ? tr('tournaments.lastGamesCount') : tr('tournaments.endsOnTime')} />
            <Fact icon="calendar-outline" label={formatDateTime(tour.startsAt)} />
            <Fact icon="people-outline" label={tour.maxPlayers ? tr('tournaments.playersOf', { n: tour.players, max: tour.maxPlayers }) : tr('tournaments.players', { count: tour.players, n: tour.players })} />
            <Fact icon={fee ? 'card-outline' : 'pricetag-outline'} label={fee ? tr('tournaments.entryFee', { fee }) : tr('tournaments.free')} />
            {requirements.map((r) => (
              <Fact key={r} icon="shield-checkmark-outline" label={r} />
            ))}
          </View>
          {tour.private && (
            <View style={{ gap: 6 }}>
              <Text variant="label">{tr('tournaments.private.title')}</Text>
              <Text tone="muted">{tour.invited.map((x) => x.username).join(', ')}</Text>
              <Text variant="caption" tone="muted">
                {tour.you?.invited ? tr('tournaments.private.youAreInvited') : tr('tournaments.private.hint')}
              </Text>
            </View>
          )}
          {paid === '1' && !tour.joined && <Text variant="label">{tr('tournaments.paymentProcessing')}</Text>}
          {paid === '0' && !tour.joined && <Text tone="muted">{tr('tournaments.paymentCancelled')}</Text>}
          {error && <Text tone="danger">{serverText(error)}</Text>}
          {open && me && (
            <View style={styles.row}>
              {tour.joined ? (
                <>
                  {tour.yourGameId ? (
                    <Button title={tr('tournaments.toGame')} onPress={() => router.navigate('/play/online')} rightIcon={<Ionicons name="arrow-forward" size={16} color={c.onAccent} />} />
                  ) : tour.status === 'running' ? (
                    <View style={{ gap: 4 }}>
                      <Text variant="label">{tr('tournaments.waitingPairing')}</Text>
                      {tour.sponsor ? <SponsorBadge sponsor={tour.sponsor} size="sm" /> : null}
                    </View>
                  ) : (
                    <Text variant="label">{tr('tournaments.joinedWait')}</Text>
                  )}
                  <Button variant="secondary" size="sm" title={tour.status === 'running' ? tr('tournaments.pause') : tr('tournaments.leave')} disabled={busy} onPress={act(() => tournamentsApi.withdraw(tour.id))} />
                </>
              ) : tour.you?.disqualified ? (
                <Text tone="danger">{tr('tournaments.removed')}</Text>
              ) : tour.you?.blocked ? (
                <Text tone="muted">{serverText(tour.you.blocked)}</Text>
              ) : fee && !tour.you?.paid && !web ? (
                <View style={{ gap: 8, flex: 1 }}>
                  <Text tone="muted">{tr('tournaments.registerOnWeb', { fee })}</Text>
                  {pageOnWeb && (
                    <Button variant="secondary" title={tr('tournaments.openOnWeb')} rightIcon={<Ionicons name="open-outline" size={16} color={c.text} />} onPress={() => void Linking.openURL(pageOnWeb)} />
                  )}
                </View>
              ) : fee && !tour.you?.paid && !paymentsEnabled ? (
                <Text tone="muted">{tr('tournaments.paymentsOff')}</Text>
              ) : (
                <Button title={fee && !tour.you?.paid ? tr('tournaments.payAndJoin', { fee }) : tr('tournaments.join')} disabled={busy || !!play.restricted} onPress={() => setJoining(true)} />
              )}
            </View>
          )}
          {open && !me && (
            <Button variant="secondary" title={tr('tournaments.signInToJoin')} onPress={() => router.push({ pathname: '/sign-in', params: { next: `/tournaments/${tour.id}` } })} />
          )}
        </GlassView>

        {prize && me && (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm, borderColor: c.accent, borderWidth: 1 }}>
            <Text variant="heading">{tr('tournaments.youWon', { place: prize.place, prize: prize.prize })}</Text>
            {tour.you?.payout ? (
              <Text tone="muted">{tr(`tournaments.payout.status.${tour.you.payout.status}`)}</Text>
            ) : (
              <>
                <Text tone="muted">{tr('tournaments.payout.cta')}</Text>
                <Button title={tr('tournaments.payout.request')} onPress={() => setPayout(true)} />
              </>
            )}
          </GlassView>
        )}

        <View style={{ gap: t.space.md }}>
          <SectionHeader title={tr('tournaments.scoring.title')} />
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
            {scoringRules(tour).map((line) => (
              <View key={line} style={styles.rule}>
                <Text tone="muted">•</Text>
                <Text tone="muted" style={{ flex: 1 }}>
                  {line}
                </Text>
              </View>
            ))}
          </GlassView>
        </View>

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
          <Tabs
            variant="underline"
            items={[
              { key: 'standings', label: tr('tournaments.standings'), count: tour.standings.length || undefined },
              { key: 'results', label: tr('tournaments.results.title'), count: tour.games.length || undefined },
              ...(tour.status !== 'cancelled' ? [{ key: 'chat' as const, label: tr('tournaments.chat.title'), count: unread || undefined }] : []),
            ]}
            value={tab}
            onChange={changeTab}
          />
          {tab === 'standings' && (
            <>
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
                    subtitle={`${s.rating} · ${tr('tournaments.record', { w: s.wins, d: s.draws, l: s.losses })}${s.buchholz !== undefined ? ` · ${tr('tournaments.buchholz', { n: formatScore(s.buchholz) })}` : ''}${s.byes ? ` · ${tr('tournaments.byes', { count: s.byes })}` : ''}${s.playing ? ` · ${tr('tournaments.playingNow')}` : ''}${s.withdrawn ? ` · ${tr('tournaments.paused')}` : ''}`}
                    right={
                      <View style={styles.row}>
                        {s.onFire && <Ionicons name="flame" size={16} color={c.warning} accessibilityLabel={tr('tournaments.onFire')} />}
                        <Text variant="figure" style={{ fontSize: 20, lineHeight: 24 }}>
                          {formatScore(s.score)}
                        </Text>
                      </View>
                    }
                  />
                ))}
              </ListGroup>
            )}
            </>
          )}
          {tab === 'results' &&
            (tour.games.length === 0 ? (
              <GlassView padding="lg" radius="xl">
                <Text tone="muted">{tr('tournaments.results.empty')}</Text>
              </GlassView>
            ) : (
              <>
                <TournamentResults games={tour.games} meId={me?.userId} limit={allResults ? undefined : 20} />
                {tour.games.length > 20 && (
                  <Button size="sm" variant="ghost" title={allResults ? tr('tournaments.results.less') : tr('tournaments.results.all', { count: tour.games.length })} onPress={() => setAllResults(!allResults)} />
                )}
              </>
            ))}
          {tab === 'chat' && tour.status !== 'cancelled' && (
            <TournamentChat
              messages={chat.messages}
              meId={me?.userId}
              onSend={me && !tour.you?.disqualified && (!tour.private || tour.you?.invited) ? chat.send : undefined}
              disabledReason={
                !me ? (
                  <Button variant="secondary" size="sm" title={tr('tournaments.chat.signIn')} onPress={() => router.push({ pathname: '/sign-in', params: { next: `/tournaments/${tour.id}` } })} />
                ) : tour.private && !tour.you?.invited ? (
                  <Text variant="caption" tone="muted">
                    {tr('tournaments.private.chatReadOnly')}
                  </Text>
                ) : null
              }
            />
          )}
        </View>
      </View>
      <JoinSheet tournament={tour} visible={joining} busy={busy} onClose={() => setJoining(false)} onAccept={() => void accept()} />
      {prize && (
        <PayoutSheet
          visible={payout}
          place={prize.place}
          prize={prize.prize}
          onClose={() => setPayout(false)}
          onSubmit={async (body) => {
            setTour((await tournamentsApi.requestPayout(tour.id, body)).tournament);
            setPayout(false);
          }}
        />
      )}
    </KeyboardScrollView>
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
  rule: { flexDirection: 'row', gap: 8 },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
