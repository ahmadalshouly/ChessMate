import { formatTimeControl, parseTimeControl, type Color } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Board } from '@/components/Board';
import { PlayerBar, useTicker } from '@/components/PlayerBar';
import { GameOverCard } from '@/components/play/GameOverCard';
import { Pill, Row } from '@/components/play/Controls';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { clockRemaining, playClient, usePlay } from '@/lib/playClient';
import { usePlayBoard } from '@/lib/usePlayBoard';

/** Live game screen. Also accepts ?tc=5+0 to quick-pair straight from the home screen. */
export default function OnlinePlay() {
  const t = useTheme();
  const { tc: tcParam } = useLocalSearchParams<{ tc?: string }>();
  const quickTc = useMemo(() => {
    try {
      return tcParam ? parseTimeControl(tcParam) : null;
    } catch {
      return null;
    }
  }, [tcParam]);
  const s = usePlay();
  const view = s.game;
  const size = useBoardSize(300);
  const live = !!view && !view.outcome;
  useTicker(live || (!!view?.opponentAbandonAt && !view.opponentConnected) || s.seek !== null);
  const board = usePlayBoard(view);
  const [hideResult, setHideResult] = useState(false);
  const gameId = view?.gameId;
  useEffect(() => setHideResult(false), [gameId]);

  const you: Color = view?.you ?? 'w';
  const opp: Color = you === 'w' ? 'b' : 'w';
  const players = view ? { w: view.white, b: view.black } : null;
  const ms = (c: Color) => (view ? clockRemaining(view.clock, c, view.clockOffset) : null);
  const history = view?.history ?? [];
  const last = history[history.length - 1];
  const abandonIn = view?.opponentAbandonAt ? Math.max(0, Math.ceil((view.opponentAbandonAt - (Date.now() + view.clockOffset)) / 1000)) : null;

  const newGame = () => {
    if (!view) return;
    playClient.seek({ timeControl: view.timeControl, rated: view.rated });
  };
  const toLobby = () => {
    playClient.dismissFinished();
    if (router.canGoBack()) router.back();
    else router.replace('/play');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: view ? `${formatTimeControl(view.timeControl)} · ${view.rated ? 'Rated' : 'Casual'}` : 'Play online' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size, gap: 8 }}>
          {s.connection !== 'online' && (
            <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
              <Text style={{ color: t.text, fontWeight: '600' }}>
                {s.connection === 'connecting' ? 'Connecting to the game server…' : 'Connection lost. Reconnecting…'}
              </Text>
              {live && <Text style={{ color: t.muted }}>Your game is kept for you while you reconnect.</Text>}
            </View>
          )}

          {!view && (
            <Card>
              {s.seek ? (
                <>
                  <Label bold>Finding a {formatTimeControl(s.seek.timeControl)} opponent…</Label>
                  <Row>
                    {s.seekStatus && <Pill text={s.seekStatus.window === null ? 'Any rating' : `Rating ±${s.seekStatus.window}`} />}
                    {s.seekStatus && <Pill text={`${s.seekStatus.poolSize} others searching`} />}
                  </Row>
                  <Button variant="secondary" title="Cancel" onPress={() => playClient.cancelSeek()} />
                </>
              ) : quickTc ? (
                <Button
                  title={`Find a ${formatTimeControl(quickTc)} game`}
                  disabled={s.connection !== 'online'}
                  onPress={() => playClient.seek({ timeControl: quickTc, rated: false })}
                />
              ) : (
                <Label muted>No game in progress.</Label>
              )}
              <Button variant="secondary" title="Open the lobby" onPress={() => router.replace('/play')} />
            </Card>
          )}

          {view && players && (
            <>
              <PlayerBar player={players[opp]} ms={ms(opp)} active={view.clock.running === opp} offline={!view.opponentConnected} />
              {!view.opponentConnected && live && (
                <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>
                    {history.length < 2
                      ? 'Opponent disconnected. The game is aborted if they do not return.'
                      : `Opponent disconnected. ${abandonIn !== null ? `You win in ${abandonIn}s if they do not return.` : 'Waiting for them to return.'}`}
                  </Text>
                </View>
              )}
              <View>
                <Board
                  fen={view.fen}
                  orientation={you}
                  size={size}
                  selected={board.selected}
                  targets={board.targets}
                  premove={view.premove}
                  lastMove={last ? { from: last.from, to: last.to } : null}
                  checkSquare={checkSquareOf(view.fen)}
                  onSquarePress={board.onSquarePress}
                />
                {view.outcome && !hideResult && (
                  <View style={[styles.overlay, { backgroundColor: t.scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)' }]}>
                    <GameOverCard
                      view={view}
                      onRematch={() => playClient.rematch()}
                      onDeclineRematch={() => playClient.declineRematch()}
                      onNewGame={newGame}
                      onLobby={toLobby}
                    />
                    <Pressable accessibilityRole="button" onPress={() => setHideResult(true)} style={styles.viewBoard}>
                      <Text style={{ color: t.text, fontWeight: '600' }}>View board</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <PlayerBar player={players[you]} ms={ms(you)} active={view.clock.running === you} />

              <Card>
                {live && (
                  <View style={styles.actions}>
                    {history.length < 2 ? (
                      <Button variant="secondary" title="Abort" onPress={playClient.abort} />
                    ) : (
                      <Button variant="secondary" title="Offer draw" onPress={playClient.offerDraw} disabled={view.drawOfferBy === you} />
                    )}
                    <Button variant="danger" title="Resign" onPress={playClient.resign} />
                    {view.premove && <Button variant="secondary" title="Cancel premove" onPress={() => playClient.setPremove(null)} />}
                  </View>
                )}
                {live && view.drawOfferBy === opp && (
                  <View style={styles.actions}>
                    <Label>Your opponent offers a draw.</Label>
                    <Button title="Accept" onPress={playClient.acceptDraw} />
                    <Button variant="secondary" title="Decline" onPress={playClient.declineDraw} />
                  </View>
                )}
                {live && !board.myTurn && <Label muted>Opponent to move. Tap a piece to queue a premove.</Label>}
                {view.outcome && hideResult && <Button title="Show result" onPress={() => setHideResult(false)} />}
                {s.error && <Label muted>{s.error}</Label>}
                {history.length > 0 ? (
                  <Label muted>{history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}</Label>
                ) : (
                  live && <Label muted>{you === 'w' ? 'You play white. Make your first move.' : 'You play black. Waiting for white’s first move.'}</Label>
                )}
              </Card>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  banner: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 6, gap: 8 },
  viewBoard: { paddingVertical: 6, paddingHorizontal: 12 },
});
