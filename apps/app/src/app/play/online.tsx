import { formatTimeControl, parseTimeControl, timeCategory, type Color } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { CreateChallenge, IncomingChallenge, InviteDetails, OutgoingChallenge, challengeEndedText } from '@/components/Challenges';
import { ChatPanel } from '@/components/ChatPanel';
import { useTicker } from '@/components/PlayerBar';
import type { GameAction } from '@/components/game/ActionBar';
import { GameLayout } from '@/components/game/GameLayout';
import { MoveList } from '@/components/game/MoveList';
import { DockNotice, NoticeButton, OptionsPanel, type OptionItem } from '@/components/game/Panels';
import { PlayerCard } from '@/components/game/PlayerCard';
import { moveLabel, useHistoryNav } from '@/components/game/useHistoryNav';
import { GameEndCelebration } from '@/components/play/GameEndCelebration';
import { GameOverCard, endResult } from '@/components/play/GameOverCard';
import { Pill, Row } from '@/components/play/Controls';
import { Button, Card, Label, Screen } from '@/components/ui';
import { serverText } from '@/i18n/serverMessages';
import { useTheme } from '@/constants/theme';
import { useGameplayPrefs } from '@/features/settings/useGameplayPrefs';
import { clockRemaining, isGuest, playClient, usePlay } from '@/lib/playClient';
import { useRecordOnlineGame } from '@/lib/recordGame';
import { useLowTimeWarning } from '@/lib/feedback';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { useGameChat } from '@/lib/useGameChat';
import { usePlayBoard } from '@/lib/usePlayBoard';
import { dirIcon, useT } from '@/i18n';
import { Button as UIButton, Modal } from '@/ui';

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
  useLowTimeWarning(view?.gameId ?? null, live, ms(you), view?.timeControl.initialMs ?? 0);
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

  const nav = useHistoryNav(history.length);
  const [panel, setPanel] = useState<'chat' | 'more' | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [chatSeen, setChatSeen] = useState(0);
  useEffect(() => {
    setPanel(null);
    setFlipped(false);
  }, [gameId]);
  const lastLine = chat.lines[chat.lines.length - 1];
  const unread = panel !== 'chat' && chat.lines.length > chatSeen && !!lastLine && lastLine.playerId !== me?.id;
  const toggle = (p: 'chat' | 'more') => {
    if (p === 'chat' || panel === 'chat') setChatSeen(chat.lines.length);
    setPanel(panel === p ? null : p);
  };

  const title = view ? `${formatTimeControl(view.timeControl)} · ${view.rated ? tr('play.rated') : tr('play.casual')}` : mode === 'friend' ? tr('home.friend.title') : tr('titles.playOnline');

  const connectionNotice = s.closedReason ? (
    <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
      <Text style={{ color: t.text, fontWeight: '600' }}>{serverText(s.closedReason)}</Text>
    </View>
  ) : s.connection !== 'online' ? (
    <View style={[styles.banner, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
      <Text style={{ color: t.text, fontWeight: '600' }}>{s.connection === 'connecting' ? tr('play.online.connectingServer') : tr('play.online.reconnecting')}</Text>
      {live && <Text style={{ color: t.muted }}>{tr('play.online.keptForYou')}</Text>}
    </View>
  ) : null;

  if (!view || !players) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <ScrollView contentContainerStyle={styles.page}>
          <View style={{ width: Math.min(size, 480), gap: 8 }}>
            {connectionNotice}
            {incoming.map((c) => (
              <IncomingChallenge key={c.id} challenge={c} actions={playClient} />
            ))}
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
                  onPress={() => playClient.seek({ timeControl: quickTc, rated: !isGuest(me) })}
                />
              ) : (
                <Label muted>{tr('play.online.noGame')}</Label>
              )}
              {!inviteId && mode !== 'friend' && <Button variant="secondary" title={tr('home.online.cta')} onPress={() => router.replace('/play')} />}
            </Card>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- the game
  const over = !!view.outcome;
  const orientation: Color = flipped ? opp : you;
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const shownMove = nav.shown > 0 ? history[nav.shown - 1] : undefined;
  const boardFen = nav.live ? view.fen : (shownMove?.fenAfter ?? START);
  const boardLast = nav.live ? last : shownMove;
  const oppOfferedRematch = view.rematchBy === opp;
  const reviewable = over && view.outcome!.reason !== 'aborted' && history.length > 0;

  const openReview = () =>
    router.push({
      pathname: '/review',
      params: { gameId: view.gameId, moves: history.map((m) => m.uci).join(','), orientation: view.you, white: view.white.name, black: view.black.name },
    });
  const resign = () => {
    if (prefs.requestResign()) playClient.resign();
  };

  const actions: GameAction[] = [
    { key: 'chat', icon: 'chat-outline', label: tr('game.action.chat'), onPress: () => toggle('chat'), active: panel === 'chat', dot: unread },
    { key: 'more', icon: 'dots-horizontal', label: tr('game.action.more'), onPress: () => toggle('more'), active: panel === 'more' },
    ...(!over
      ? history.length < 2
        ? [{ key: 'abort', icon: 'close-circle-outline' as const, label: tr('game.action.abort'), onPress: playClient.abort }]
        : [{ key: 'draw', icon: 'handshake-outline' as const, label: tr('game.action.draw'), onPress: playClient.offerDraw, disabled: view.drawOfferBy === you, dot: view.drawOfferBy === opp }]
      : [{ key: 'review', icon: 'chart-box-outline' as const, label: tr('game.action.review'), onPress: openReview, disabled: !reviewable }]),
    !over
      ? { key: 'resign', icon: 'flag-outline', label: tr('game.action.resign'), onPress: resign, disabled: history.length < 2, danger: true }
      : {
          key: 'rematch',
          icon: 'refresh',
          label: tr('game.action.rematch'),
          onPress: () => playClient.rematch(),
          dot: oppOfferedRematch,
          disabled: !oppOfferedRematch && (view.rematchBy === you || view.rematchDeclined || !view.opponentConnected),
        },
    { key: 'back', icon: dirIcon('chevron-left'), label: tr('game.action.back'), onPress: nav.back, disabled: !nav.canBack, repeat: true },
    { key: 'forward', icon: dirIcon('chevron-right'), label: tr('game.action.forward'), onPress: nav.forward, disabled: !nav.canForward, repeat: true },
  ];

  const moreItems: OptionItem[] = [
    { key: 'flip', icon: 'swap-vertical', label: tr('game.more.flip'), onPress: () => setFlipped((f) => !f) },
    ...(view.premove ? [{ key: 'premove', icon: 'cancel' as const, label: tr('game.more.cancelPremove'), onPress: () => playClient.setPremove(null) }] : []),
    ...(over
      ? [
          ...(hideResult ? [{ key: 'result', icon: 'trophy-outline' as const, label: tr('game.over.showResult'), onPress: () => { setHideResult(false); setPanel(null); } }] : []),
          { key: 'new', icon: 'plus-circle-outline' as const, label: tr('game.more.newGame', { tc: formatTimeControl(view.timeControl) }), onPress: newGame },
          ...(view.outcome!.reason !== 'aborted'
            ? [{ key: 'history', icon: 'history' as const, label: tr('game.more.reviewHistory'), onPress: () => router.push({ pathname: '/games/[id]', params: { id: `on_${view.gameId}` } }) }]
            : []),
          { key: 'lobby', icon: 'home-outline' as const, label: tr('game.more.lobby'), onPress: toLobby },
        ]
      : []),
  ];

  const dockHeader = (
    <>
      {!nav.live && (
        <DockNotice icon="history" text={tr('game.viewingMove', { move: moveLabel(history, nav.shown) })}>
          <NoticeButton icon="skip-next" label={tr('game.live')} onPress={nav.toLive} />
        </DockNotice>
      )}
      {live && prefs.pending && (
        <DockNotice icon="help-circle-outline" text={tr('play.confirmMoveQ', { san: prefs.pending.san })} strong>
          <NoticeButton icon="close" label={tr('common.cancel')} onPress={prefs.cancel} />
          <NoticeButton icon="check" label={tr('play.confirmMove')} onPress={prefs.confirm} primary />
        </DockNotice>
      )}
      {live && view.drawOfferBy === opp && (
        <DockNotice icon="handshake-outline" text={tr('play.online.drawOffered')} strong>
          <NoticeButton icon="close" label={tr('common.decline')} onPress={playClient.declineDraw} />
          <NoticeButton icon="check" label={tr('common.accept')} onPress={playClient.acceptDraw} primary />
        </DockNotice>
      )}
      {live && view.drawOfferBy === you && <DockNotice icon="handshake-outline" text={`${tr('game.draw.offered')}. ${tr('game.draw.offeredBody')}`} />}
      {!view.opponentConnected && live && (
        <DockNotice
          icon="wifi-off"
          text={history.length < 2 ? tr('play.online.oppGoneEarly') : abandonIn !== null ? tr('play.online.oppGoneWin', { n: abandonIn }) : tr('play.online.oppGoneWait')}
        />
      )}
      {s.error && <DockNotice icon="alert-circle-outline" text={serverText(s.error)} />}
    </>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <GameLayout
        notice={connectionNotice}
        top={<PlayerCard player={players[top]} ms={ms(top)} active={view.clock.running === top} offline={top === opp && !view.opponentConnected} />}
        bottom={<PlayerCard player={players[orientation]} ms={ms(orientation)} active={view.clock.running === orientation} offline={orientation === opp && !view.opponentConnected} />}
        renderBoard={(boardSize) => (
          <>
            <Board
              fen={boardFen}
              orientation={orientation}
              size={boardSize}
              selected={nav.live ? board.selected : null}
              targets={nav.live ? board.targets : []}
              premove={nav.live ? view.premove : null}
              lastMove={boardLast ? { from: boardLast.from, to: boardLast.to } : null}
              checkSquare={checkSquareOf(boardFen)}
              onSquarePress={nav.live ? board.onSquarePress : undefined}
              {...(nav.live ? board.dragProps : {})}
            />
            {over && !hideResult && (
              <View style={[styles.overlay, { backgroundColor: t.scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)' }]}>
                <GameOverCard
                  view={view}
                  onRematch={() => playClient.rematch()}
                  onDeclineRematch={() => playClient.declineRematch()}
                  onNewGame={newGame}
                  onLobby={toLobby}
                  onReview={reviewable ? openReview : undefined}
                  onClose={() => setHideResult(true)}
                />
              </View>
            )}
            {/* Drawn above the result card; touches pass through. */}
            {over && endResult(view) && (
              <GameEndCelebration key={view.gameId} result={endResult(view)!} checkmate={view.outcome!.reason === 'checkmate'} seed={view.gameId} width={boardSize} height={boardSize} />
            )}
          </>
        )}
        dock={
          <MoveList
            sans={history.map((m) => m.san)}
            shown={nav.shown}
            onSelect={nav.goTo}
            header={dockHeader}
            empty={live ? (you === 'w' ? tr('play.online.firstMoveWhite') : tr('play.online.firstMoveBlack')) : undefined}
          />
        }
        panel={
          panel === 'chat' ? (
            <ChatPanel chat={chat} me={me} opponent={players[opp]} canChat fill onClose={() => setPanel(null)} />
          ) : panel === 'more' ? (
            <OptionsPanel
              title={tr('game.more.title')}
              onClose={() => setPanel(null)}
              items={moreItems.map((it) => ({ ...it, onPress: () => { setPanel(null); it.onPress(); } }))}
            />
          ) : null
        }
        actions={actions}
      />
      <Modal
        visible={prefs.resignAsked}
        onClose={prefs.cancelResign}
        title={tr('game.resign.title')}
        description={tr('game.resign.body')}
        actions={
          <>
            <UIButton variant="ghost" title={tr('play.keepPlaying')} onPress={prefs.cancelResign} />
            <UIButton variant="danger" title={tr('game.resign.confirm')} onPress={resign} />
          </>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  banner: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2, marginHorizontal: 12, marginTop: 8 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 6 },
});
