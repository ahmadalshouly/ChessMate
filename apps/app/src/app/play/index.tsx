import { formatTimeControl, parseTimeControl, timeCategory, type ColorChoice, type OpenGame, type TimeControl } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { serverText } from '@/i18n/serverMessages';
import { useTicker } from '@/components/PlayerBar';
import { Pill, Row, Segmented, Stepper, Tile } from '@/components/play/Controls';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { isGuest, playClient, usePlay } from '@/lib/playClient';
import { useT, type TKey } from '@/i18n';

const GROUPS: { name: TKey; controls: string[] }[] = [
  { name: 'common.category.bullet', controls: ['1+0', '1+1', '2+1'] },
  { name: 'common.category.blitz', controls: ['3+0', '3+2', '5+0', '5+3'] },
  { name: 'common.category.rapid', controls: ['10+0', '10+5', '15+10'] },
  { name: 'common.category.classical', controls: ['30+0', '30+20'] },
];

const MINUTES = [0.5, 1, 2, 3, 4, 5, 7, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180];
const INCREMENTS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

type Window = 0 | 100 | 200 | 400;

export default function Lobby() {
  const s = usePlay();
  const tr = useT();
  const guest = isGuest(s.me);
  const [tcKey, setTcKey] = useState('5+0');
  const [custom, setCustom] = useState({ min: 7, inc: 2 });
  const [rated, setRated] = useState(false);
  const [window, setWindow] = useState<Window>(0);
  const [color, setColor] = useState<ColorChoice>('random');

  useEffect(() => playClient.lobbySub(), []);
  useEffect(() => {
    if (guest) setRated(false);
  }, [guest]);

  // A game started (quick pairing, open game joined, or resumed): go play it.
  const liveGameId = s.game && !s.game.outcome ? s.game.gameId : null;
  useEffect(() => {
    if (liveGameId) router.push('/play/online');
  }, [liveGameId]);

  const timeControl: TimeControl = useMemo(
    () => (tcKey === 'custom' ? { initialMs: custom.min * 60_000, incrementMs: custom.inc * 1000 } : parseTimeControl(tcKey)),
    [tcKey, custom],
  );
  const tcLabel = formatTimeControl(timeControl);
  const range = window === 0 ? undefined : window;
  const seeking = s.seek !== null;
  const busy = seeking || s.openGame !== null;

  const poolCount = (key: string) => {
    const tc = parseTimeControl(key);
    return (s.lobby?.pools ?? [])
      .filter((p) => p.timeControl.initialMs === tc.initialMs && p.timeControl.incrementMs === tc.incrementMs)
      .reduce((n, p) => n + p.seeking, 0);
  };

  const step = (list: number[], cur: number, dir: 1 | -1) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(cur) + dir))]!;

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('nav.play') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <Label size={28} bold>
              {tr('nav.play')}
            </Label>
            <Row>
              <Pill text={s.connection === 'online' ? tr('play.lobby.online', { count: s.lobby?.online ?? 0 }) : s.connection === 'connecting' ? tr('play.connecting') : tr('play.offline')} />
              {s.lobby ? <Pill text={tr('play.lobby.playing', { count: s.lobby.playing })} /> : null}
            </Row>
          </View>

          {liveGameId && (
            <Card>
              <Label bold>{tr('play.lobby.inProgress')}</Label>
              <Button title={tr('play.lobby.resume')} onPress={() => router.push('/play/online')} />
            </Card>
          )}

          {seeking && s.seek && <SeekingCard />}

          {s.openGame && (
            <Card>
              <Label bold>
                {tr(s.openGame.rated ? 'play.lobby.waitingRated' : 'play.lobby.waitingCasual', { tc: formatTimeControl(s.openGame.timeControl) })}
              </Label>
              <Label muted>{tr('play.lobby.listedBelow')}</Label>
              <Button variant="secondary" title={tr('common.cancel')} onPress={() => playClient.cancelOpenGame()} />
            </Card>
          )}

          <Card>
            <Label size={18} bold>
              {tr('play.lobby.timeControl')}
            </Label>
            {GROUPS.map((g) => (
              <View key={g.name} style={{ gap: 6 }}>
                <Label muted>{tr(g.name)}</Label>
                <View style={styles.grid}>
                  {g.controls.map((key) => {
                    const n = poolCount(key);
                    return (
                      <View key={key} style={[styles.cell, { width: `${100 / g.controls.length}%` }]}>
                        <Tile title={key} caption={n > 0 ? tr('play.lobby.waiting', { count: n }) : tr(g.name)} selected={tcKey === key} onPress={() => setTcKey(key)} />
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={styles.grid}>
              <View style={[styles.cell, { width: '100%' }]}>
                <Tile title={tr('play.lobby.custom')} caption={tcKey === 'custom' ? `${tcLabel} · ${tr(`common.category.${timeCategory(timeControl)}`)}` : tr('play.lobby.pickOwn')} selected={tcKey === 'custom'} onPress={() => setTcKey('custom')} />
              </View>
            </View>
            {tcKey === 'custom' && (
              <View style={{ gap: 8 }}>
                <Stepper
                  label={tr('play.lobby.minutes')}
                  value={custom.min < 1 ? '½' : String(custom.min)}
                  onDec={() => setCustom((c) => ({ ...c, min: step(MINUTES, c.min, -1) }))}
                  onInc={() => setCustom((c) => ({ ...c, min: step(MINUTES, c.min, 1) }))}
                />
                <Stepper
                  label={tr('play.lobby.increment')}
                  value={tr('play.lobby.seconds', { n: custom.inc })}
                  onDec={() => setCustom((c) => ({ ...c, inc: step(INCREMENTS, c.inc, -1) }))}
                  onInc={() => setCustom((c) => ({ ...c, inc: step(INCREMENTS, c.inc, 1) }))}
                />
              </View>
            )}
          </Card>

          <Card>
            <Label size={18} bold>
              {tr('play.lobby.gameOptions')}
            </Label>
            <Segmented
              value={rated ? 'rated' : 'casual'}
              onChange={(v) => setRated(v === 'rated')}
              options={[
                { value: 'casual', label: tr('play.casual') },
                { value: 'rated', label: tr('play.rated'), disabled: guest },
              ]}
            />
            {guest && <Label muted>{tr('play.lobby.guestRated')}</Label>}
            <Label muted>{tr('play.lobby.opponentRating')}</Label>
            <Segmented<Window>
              value={window}
              onChange={setWindow}
              options={[
                { value: 0, label: tr('play.lobby.auto') },
                { value: 100, label: '±100' },
                { value: 200, label: '±200' },
                { value: 400, label: '±400' },
              ]}
            />
            <Label muted>
              {window === 0 ? tr('play.lobby.autoHint') : tr('play.lobby.windowHint', { n: window })}
            </Label>
            <View style={{ gap: 8, marginTop: 4 }}>
              <Button title={tr(rated ? 'play.lobby.playRated' : 'play.lobby.playCasual', { tc: tcLabel })} disabled={busy || !!liveGameId || s.connection !== 'online'} onPress={() => playClient.seek({ timeControl, rated, range })} />
            </View>
          </Card>

          <Card>
            <Label size={18} bold>
              {tr('play.lobby.createTitle')}
            </Label>
            <Label muted>{range ? tr('play.lobby.postHintRange', { tc: tcLabel, n: range }) : tr('play.lobby.postHint', { tc: tcLabel })}</Label>
            <Segmented<ColorChoice>
              value={color}
              onChange={setColor}
              options={[
                { value: 'w', label: tr('play.white') },
                { value: 'random', label: tr('play.random') },
                { value: 'b', label: tr('play.black') },
              ]}
            />
            <Button variant="secondary" title={tr('play.lobby.create')} disabled={busy || !!liveGameId || s.connection !== 'online'} onPress={() => playClient.createOpenGame(timeControl, rated, color, range)} />
          </Card>

          <OpenGamesList />
          {s.error && (
            <Card>
              <Label>{serverText(s.error)}</Label>
              <Button variant="secondary" title={tr('common.dismiss')} onPress={() => playClient.clearError()} />
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function SeekingCard() {
  const s = usePlay();
  const tr = useT();
  useTicker(true);
  if (!s.seek) return null;
  const st = s.seekStatus;
  const waited = st ? st.waitedMs + (Date.now() - st.at) : 0;
  const secs = Math.floor(waited / 1000);
  return (
    <Card>
      <Label size={18} bold>
        {tr(s.seek.rated ? 'play.lobby.findingRated' : 'play.lobby.findingCasual', { tc: formatTimeControl(s.seek.timeControl) })}
      </Label>
      <Row>
        <Pill text={`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`} tone="strong" />
        {st && <Pill text={st.window === null ? tr('play.lobby.anyRating') : tr('play.lobby.ratingWindow', { n: st.window })} />}
        {st && <Pill text={tr('play.lobby.othersSearching', { count: st.poolSize })} />}
      </Row>
      <Button variant="secondary" title={tr('common.cancel')} onPress={() => playClient.cancelSeek()} />
    </Card>
  );
}

function OpenGamesList() {
  const s = usePlay();
  const tr = useT();
  const games = s.lobby?.openGames ?? [];
  const myRating = s.me?.rating ?? 1500;
  const colorText = (g: OpenGame) => (g.color === 'random' ? tr('play.lobby.randomSide') : g.color === 'w' ? tr('play.lobby.youPlayBlack') : tr('play.lobby.youPlayWhite'));
  return (
    <Card>
      <Label size={18} bold>
        {tr('play.lobby.openGames')}
      </Label>
      {games.length === 0 && <Label muted>{tr('play.lobby.noOpen')}</Label>}
      {games.map((g) => {
        const mine = g.by.id === s.me?.id;
        const outOfRange = g.range !== undefined && Math.abs(g.by.rating - myRating) > g.range;
        const needsAccount = g.rated && isGuest(s.me);
        return (
          <View key={g.id} style={styles.openRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label bold>
                {g.by.name} ({g.by.rating}
                {g.by.provisional ? '?' : ''})
              </Label>
              <Label muted>
                {formatTimeControl(g.timeControl)} · {g.rated ? tr('play.rated') : tr('play.casual')} · {mine ? tr('play.lobby.yourGame') : colorText(g)}
                {g.range ? ` · ±${g.range}` : ''}
              </Label>
            </View>
            {mine ? (
              <Button variant="secondary" title={tr('common.cancel')} onPress={() => playClient.cancelOpenGame()} />
            ) : (
              <Button
                title={needsAccount ? tr('auth.signIn') : outOfRange ? tr('play.lobby.outOfRange') : tr('play.lobby.join')}
                disabled={needsAccount || outOfRange || !!(s.game && !s.game.outcome)}
                onPress={() => playClient.joinOpenGame(g.id)}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '33.33%', padding: 4 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
});
