import { formatTimeControl, parseTimeControl, timeCategory, type Color } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { CreateChallenge, IncomingChallenge, InviteDetails, OutgoingChallenge, challengeEndedText } from '@/components/Challenges';
import { ChatPanel } from '@/components/ChatPanel';
import { PlayerBar, useTicker } from '@/components/PlayerBar';
import { GameOverCard } from '@/components/play/GameOverCard';
import { Pill, Row } from '@/components/play/Controls';
import { Button, Card, Label, Screen } from '@/components/ui';
import { serverText } from '@/i18n/serverMessages';
import { useTheme } from '@/constants/theme';
import { useGameplayPrefs } from '@/features/settings/useGameplayPrefs';
import { clockRemaining, playClient, usePlay } from '@/lib/playClient';
import { useRecordOnlineGame } from '@/lib/recordGame';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { useGameChat } from '@/lib/useGameChat';
import { usePlayBoard } from '@/lib/usePlayBoard';
import { useT } from '@/i18n';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEFAULT_TC = { initialMs: 300_000, incrementMs: 0 };

/**
 * Live game screen.
 * - `?tc=5+0` quick-pairs straight from the home screen.
 * - `?mode=friend` sets up a challenge (`to=<player id>` prefills a direct one).
 * - `?challenge=<id>` shows an invite link that was opened.
 */
export default function OnlinePlay() {
  const t = useTheme();
  const tr = useT();
  const { tc: tcParam, mode, to, challenge: inviteId } = useLocalSearchParams<{ tc?: string; mode?: string; to?: string; challenge?: string }>();
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
  useRecordOnlineGame(view);

  // Move and resign confirmation follow the user's gameplay settings.
  const prefs = useGameplayPrefs(view?.fen ?? START, timeCategory(view?.timeControl ?? quickTc ?? DEFAULT_TC), (uci) => playClient.move(uci));
  const board = usePlayBoard(view, prefs.move);
  const chat = useGameChat(view?.gameId ?? null, s.me?.id ?? null, playClient.send, playClient.onServerMessage);

  const [hideResult, setHideResult] = useState(false);
  const gameId = view?.gameId;
  useEffect(() => setHideResult(false), [gameId]);

  const you: Color = view?.you ?? 'w';
  const opp: Color = you === 'w' ? 'b' : 'w';
  const players = view ? { w: view.white, b: view.black } : null;
  const ms = (c: Color) => (view ? clockRemaining(view.clock, c, view.clockOffset) : null);
  const history = view?.history ?? [];
  const last = prefs.pending ?? history[history.length - 1];
  const abandonIn = view?.opponentAbandonAt ? Math.max(0, Math.ceil((view.opponentAbandonAt - (Date.now() + view.clockOffset)) / 1000)) : null;

  const me = s.me;
  const connected = s.connection === 'online' && !!me;
  const pending = Object.values(s.challenges).filter((c) => c.status === 'pending');
  const incoming = pending.filter((c) => me && c.to?.id === me.id && c.id !== inviteId);
  const outgoing = pending.filter((c) => me && c.from.id === me.id);
  const declined = Object.entries(s.challengeEnded).find(([, r]) => r !== 'accepted' && r !== 'cancelled');

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
      <Stack.Screen
        options={{ title: view ? `${formatTimeControl(view.timeControl)} · ${view.rated ? tr('play.rated') : tr('play.casual')}` : mode === 'friend' ? tr('home.friend.title') : tr('titles.playOnline') }}
      />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size, gap: 8 }}>
          {s.closedReason ? (
            <Card>
              <Label bold>{serverText(s.closedReason)}</Label>
            </Card>
          ) : (
            s.connection !== 'online' && (
              <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
                <Text style={{ color: t.text, fontWeight: '600' }}>
                  {s.connection === 'connecting' ? tr('play.online.connectingServer') : tr('play.online.reconnecting')}
                </Text>
                {live && <Text style={{ color: t.muted }}>{tr('play.online.keptForYou')}</Text>}
              </View>
            )
          )}

          {!live && incoming.map((c) => <IncomingChallenge key={c.id} challenge={c} actions={playClient} />)}

          {!view && (
            <Card>
              {inviteId ? (
                <InviteDetails
                  id={inviteId}
                  me={me}
                  challenge={s.challenges[inviteId]}
                  ended={s.challengeEnded[inviteId]}
                  error={s.error}
                  connected={connected}
                  actions={playClient}
                />
              ) : mode === 'friend' ? (
                outgoing.length > 0 ? (
                  outgoing.map((c) => <OutgoingChallenge key={c.id} challenge={c} actions={playClient} />)
                ) : (
                  <>
                    {declined && <Label muted>{challengeEndedText(declined[1])}.</Label>}
                    <CreateChallenge me={me} actions={playClient} initialTo={to} initialTc={quickTc ?? undefined} />
                  </>
                )
              ) : s.seek ? (
                <>
                  <Label bold>{tr('play.online.finding', { tc: formatTimeControl(s.seek.timeControl) })}</Label>
                  <Row>
                    {s.seekStatus && <Pill text={s.seekStatus.window === null ? tr('play.lobby.anyRating') : tr('play.lobby.ratingWindow', { n: s.seekStatus.window })} />}
                    {s.seekStatus && <Pill text={tr('play.lobby.othersSearching', { count: s.seekStatus.poolSize })} />}
                  </Row>
                  <Button variant="secondary" title={tr('common.cancel')} onPress={() => playClient.cancelSeek()} />
                </>
              ) : quickTc ? (
                <Button
                  title={tr('play.online.findGame', { tc: formatTimeControl(quickTc) })}
                  disabled={s.connection !== 'online'}
                  onPress={() => playClient.seek({ timeControl: quickTc, rated: false })}
                />
              ) : (
                <Label muted>{tr('play.online.noGame')}</Label>
              )}
              {!inviteId && mode !== 'friend' && <Button variant="secondary" title={tr('home.online.cta')} onPress={() => router.replace('/play')} />}
            </Card>
          )}

          {view && players && (
            <>
              <PlayerBar player={players[opp]} ms={ms(opp)} active={view.clock.running === opp} offline={!view.opponentConnected} />
              {!view.opponentConnected && live && (
                <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>
                    {history.length < 2
                      ? tr('play.online.oppGoneEarly')
                      : abandonIn !== null
                        ? tr('play.online.oppGoneWin', { n: abandonIn })
                        : tr('play.online.oppGoneWait')}
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
                      <Text style={{ color: t.text, fontWeight: '600' }}>{tr('play.online.viewBoard')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <PlayerBar player={players[you]} ms={ms(you)} active={view.clock.running === you} />

              <Card>
                {live && (
                  <View style={styles.actions}>
                    {history.length < 2 ? (
                      <Button variant="secondary" title={tr('play.abort')} onPress={playClient.abort} />
                    ) : (
                      <Button variant="secondary" title={tr('play.offerDraw')} onPress={playClient.offerDraw} disabled={view.drawOfferBy === you} />
                    )}
                    <Button variant="danger" title={prefs.resignAsked ? tr('play.confirmResign') : tr('play.resign')} onPress={() => prefs.requestResign() && playClient.resign()} />
                    {prefs.resignAsked && <Button variant="secondary" title={tr('play.keepPlaying')} onPress={prefs.cancelResign} />}
                    {view.premove && <Button variant="secondary" title={tr('play.cancelPremove')} onPress={() => playClient.setPremove(null)} />}
                  </View>
                )}
                {live && prefs.pending && (
                  <View style={styles.actions}>
                    <Label>{tr('play.confirmMoveQ', { san: prefs.pending.san })}</Label>
                    <Button title={tr('play.confirmMove')} onPress={prefs.confirm} />
                    <Button variant="secondary" title={tr('common.cancel')} onPress={prefs.cancel} />
                  </View>
                )}
                {live && view.drawOfferBy === opp && (
                  <View style={styles.actions}>
                    <Label>{tr('play.online.drawOffered')}</Label>
                    <Button title={tr('common.accept')} onPress={playClient.acceptDraw} />
                    <Button variant="secondary" title={tr('common.decline')} onPress={playClient.declineDraw} />
                  </View>
                )}
                {live && !board.myTurn && <Label muted>{tr('play.online.premoveHint')}</Label>}
                {view.outcome && hideResult && <Button title={tr('play.online.showResult')} onPress={() => setHideResult(false)} />}
                {view.outcome && view.outcome.reason !== 'aborted' && (
                  <View style={styles.actions}>
                    <Button
                      variant="secondary"
                      title={tr('play.online.reviewHistory')}
                      onPress={() => router.push({ pathname: '/games/[id]', params: { id: `on_${view.gameId}` } })}
                    />
                    {history.length > 0 && (
                      <Button
                        variant="secondary"
                        title={tr('play.engineReview')}
                        onPress={() =>
                          router.push({
                            pathname: '/review',
                            params: { gameId: view.gameId, moves: history.map((m) => m.uci).join(','), orientation: view.you },
                          })
                        }
                      />
                    )}
                  </View>
                )}
                {s.error && <Label muted>{serverText(s.error)}</Label>}
                {history.length > 0 ? (
                  <Label muted>{history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}</Label>
                ) : (
                  live && <Label muted>{you === 'w' ? tr('play.online.firstMoveWhite') : tr('play.online.firstMoveBlack')}</Label>
                )}
              </Card>
              <ChatPanel chat={chat} me={me} opponent={players[opp]} canChat />
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
