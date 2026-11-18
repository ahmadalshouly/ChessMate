import type { TournamentDetail } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack as RouterStack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Page } from '@/components/shell/Page';
import { FormatMark, Meta, Pairings, PrizeLadder, Standings, StatusBadge, formatLine, formatScore, ratingLimit, timeLine } from '@/features/tournaments/ui';
import { dirIcon, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { useAuth } from '@/lib/auth';
import { usePlay } from '@/lib/playClient';
import { useNow, usePolling, useTournamentsApi } from '@/lib/tournamentsApi';
import { Badge, Button, GlassView, Modal, Row, Skeleton, Stack, Text, useAppTheme, useToast } from '@/ui';

/** One tournament: where it stands, your entry, prizes, standings and games. */
export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const theme = useAppTheme();
  const c = theme.colors;
  const api = useTournamentsApi();
  const { status: authStatus, user } = useAuth();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const wide = (width >= 960 ? width - 250 : width) >= 860;
  const [fast, setFast] = useState(false);
  const { data: t, setData, error, reload } = usePolling(() => api.detail(String(id)), fast ? 3_000 : 10_000, [api, id]);
  const now = useNow(!!t && (t.status === 'running' || t.status === 'scheduled'));
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const play = usePlay();

  useEffect(() => {
    setFast(!!t && (t.status === 'running' || (t.status === 'scheduled' && t.startsAt - Date.now() < 120_000)));
  }, [t]);

  // Your next tournament game opens by itself while you are on this page.
  const focused = useRef(false);
  const opened = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void reload();
      return () => {
        focused.current = false;
      };
    }, [reload]),
  );
  const liveGame = play.game && !play.game.outcome && play.game.tournament?.id === id ? play.game.gameId : null;
  useEffect(() => {
    if (!liveGame || opened.current === liveGame || !focused.current) return;
    opened.current = liveGame;
    router.push('/play/online');
  }, [liveGame]);

  const act = async (fn: () => Promise<TournamentDetail>) => {
    setBusy(true);
    try {
      setData(await fn());
    } catch (e) {
      toast.show({ title: serverText(e instanceof Error ? e.message : String(e)), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  if (!t) {
    return (
      <Page maxWidth={1080}>
        <RouterStack.Screen options={{ title: tr('tournaments.title') }} />
        {error ? (
          <GlassView radius="xl" padding="lg" style={{ gap: 12, alignItems: 'flex-start' }}>
            <Text variant="bodyStrong">{tr('tournaments.load')}</Text>
            <Text tone="muted">{serverText(error)}</Text>
            <Button title={tr('tournaments.retry')} variant="secondary" size="sm" onPress={reload} />
          </GlassView>
        ) : (
          <Stack gap="md">
            <Skeleton height={180} radius="xl" />
            <Skeleton height={260} radius="xl" />
          </Stack>
        )}
      </Page>
    );
  }

  const me = t.me;
  const myRow = t.standings.find((s) => s.userId === user?.id);
  const myGame = me?.gameId ?? liveGame;
  const limits = ratingLimit(t);
  const open = t.status === 'scheduled' || t.status === 'running';
  const winners = t.standings.filter((s) => s.prize);

  const entry = (
    <GlassView radius="xl" padding="lg" elevation="md" style={{ gap: 14 }}>
      {myGame ? (
        <>
          <Row gap="sm">
            <Badge label={tr('tournaments.pairings.live')} tone="live" />
            <Text variant="bodyStrong">{tr('tournaments.me.playing')}</Text>
          </Row>
          <Button title={tr('tournaments.action.toGame')} onPress={() => router.push('/play/online')} rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={16} color={c.onAccent} />} />
        </>
      ) : authStatus !== 'signedIn' && open ? (
        <>
          <Text tone="muted">{tr('tournaments.block.guest')}</Text>
          <Button title={tr('tournaments.action.signUp')} onPress={() => router.push('/sign-up')} />
        </>
      ) : me?.status && open ? (
        <>
          <Text tone="muted">{t.status === 'scheduled' ? tr('tournaments.me.scheduled') : tr(`tournaments.me.${me.status}`)}</Text>
          {myRow && t.status === 'running' && (
            <Text variant="heading">{tr('tournaments.me.rank', { rank: myRow.rank, score: formatScore(myRow.score) })}</Text>
          )}
          <Row gap="sm" wrap>
            {me.status === 'active' ? (
              <Button
                title={t.status === 'scheduled' ? tr('tournaments.action.leave') : t.format === 'arena' ? tr('tournaments.action.pause') : tr('tournaments.action.leave')}
                variant="secondary"
                loading={busy}
                onPress={() => setConfirmLeave(true)}
              />
            ) : me.canJoin ? (
              <Button title={me.status === 'paused' ? tr('tournaments.action.resume') : tr('tournaments.action.rejoin')} loading={busy} onPress={() => act(() => api.join(t.id))} />
            ) : null}
          </Row>
        </>
      ) : open ? (
        <>
          {me?.joinBlock && !me.canJoin ? <Text tone="muted">{tr(`tournaments.block.${me.joinBlock}`, { rating: me.rating ?? '' })}</Text> : null}
          <Button title={tr('tournaments.action.join')} disabled={!me?.canJoin} loading={busy} onPress={() => act(() => api.join(t.id))} />
        </>
      ) : myRow ? (
        <Text variant="heading">{tr('tournaments.me.rank', { rank: myRow.rank, score: formatScore(myRow.score) })}</Text>
      ) : null}
    </GlassView>
  );

  const header = (
    <GlassView radius="xl" padding="xl" elevation="md" style={{ gap: 16 }}>
      <Row gap="md" align="flex-start">
        <FormatMark format={t.format} live={t.status === 'running'} size={52} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Row gap="sm" wrap>
            <StatusBadge status={t.status} />
            {t.joined && <Badge label={tr('tournaments.joined')} tone="solid" />}
          </Row>
          <Text variant="title">{t.name}</Text>
          <Text tone="muted">{formatLine(t)}</Text>
        </View>
      </Row>
      <View style={[styles.metaRow, { borderTopColor: c.border }]}>
        <Meta icon="time-outline" text={timeLine(t, now)} strong />
        <Meta icon="people-outline" text={t.maxPlayers ? tr('tournaments.playersOf', { count: t.players, max: t.maxPlayers }) : tr('tournaments.players', { count: t.players })} />
        {limits && <Meta icon="speedometer-outline" text={limits} />}
      </View>
      {t.status === 'cancelled' && t.cancelReason ? <Text tone="danger">{tr('tournaments.cancelled', { reason: t.cancelReason })}</Text> : null}
      {t.description ? <Text>{t.description}</Text> : null}
    </GlassView>
  );

  const side = (
    <Stack gap="lg">
      <GlassView radius="xl" padding="lg" style={{ gap: 14 }}>
        <Row justify="space-between">
          <Text variant="overline" tone="muted">
            {tr('tournaments.prizePool')}
          </Text>
          <Ionicons name="trophy-outline" size={16} color={c.muted} />
        </Row>
        <PrizeLadder pool={t.prizePool} winners={winners} />
      </GlassView>
      <GlassView radius="xl" padding="lg" style={{ gap: 10 }}>
        <Text variant="overline" tone="muted">
          {tr('tournaments.rules')}
        </Text>
        <Text tone="muted">{tr(`tournaments.formatHelp.${t.format}`)}</Text>
      </GlassView>
    </Stack>
  );

  const standings = (
    <GlassView radius="xl" padding="none" style={{ overflow: 'hidden' }}>
      <View style={styles.panelHead}>
        <Text variant="overline" tone="muted">
          {tr('tournaments.standings.title')}
        </Text>
      </View>
      <Standings rows={t.standings} format={t.format} me={user?.id} />
    </GlassView>
  );

  const games = (
    <GlassView radius="xl" padding="none" style={{ overflow: 'hidden' }}>
      <View style={styles.panelHead}>
        <Text variant="overline" tone="muted">
          {tr('tournaments.pairings.title')}
        </Text>
      </View>
      <Pairings rows={t.pairings} me={user?.id} />
    </GlassView>
  );

  return (
    <Page maxWidth={1080}>
      <RouterStack.Screen options={{ title: t.name }} />
      {header}
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <Stack gap="lg" style={{ flex: 1.5, minWidth: 0 }}>
            {entry}
            {standings}
            {games}
          </Stack>
          <View style={{ flex: 1, minWidth: 0 }}>{side}</View>
        </View>
      ) : (
        <Stack gap="lg">
          {entry}
          {standings}
          {side}
          {games}
        </Stack>
      )}
      <Modal
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={tr('tournaments.leave.title')}
        description={t.status === 'scheduled' ? tr('tournaments.leave.scheduled') : tr(`tournaments.leave.${t.format}`)}
        actions={
          <>
            <Button variant="ghost" title={tr('common.cancel')} onPress={() => setConfirmLeave(false)} />
            <Button
              variant="danger"
              title={tr('tournaments.leave.confirm')}
              onPress={() => {
                setConfirmLeave(false);
                void act(() => api.leave(t.id));
              }}
            />
          </>
        }
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 8, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  panelHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
});
