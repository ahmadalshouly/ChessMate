import { formatTimeControl, gamePath, materialBalance, opposite, parseTimeControl, timeCategory, watchPath, type Color } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { useGameLock } from '@/lib/useGameLock';
import { CreateChallenge, IncomingChallenge, InviteDetails, OutgoingChallenge, challengeEndedText } from '@/components/Challenges';
import { ChatPanel } from '@/components/ChatPanel';
import { ReportDialog } from '@/components/ReportDialog';
import { RestrictionBanner } from '@/components/shell/RestrictionBanner';
import { SponsorBadge } from '@/features/tournaments/SponsorBadge';
import { useTournamentSponsor } from '@/features/tournaments/useTournamentSponsor';
import { useTicker } from '@/components/PlayerBar';
import type { GameAction } from '@/components/game/ActionBar';
import { GameLayout } from '@/components/game/GameLayout';
import { MoveStrip } from '@/components/game/MoveStrip';
import { ConfirmPanel, BoardNotice, NoticeButton, OptionsPanel, type OptionItem } from '@/components/game/Panels';
import { PlayerCard } from '@/components/game/PlayerCard';
import { hasProfile } from '@/components/game/usePlayerProfile';
import { useHistoryNav } from '@/components/game/useHistoryNav';
import { GameEndCelebration } from '@/components/play/GameEndCelebration';
import { GameStartHandshake, useGameStartHandshake } from '@/components/play/GameStartHandshake';
import { GameOverCard, endResult } from '@/components/play/GameOverCard';
import { ResultPopup } from '@/components/play/ResultPopup';
import { Pill, Row } from '@/components/play/Controls';
import { Button, Card, Label, Screen } from '@/components/ui';
import { serverText } from '@/i18n/serverMessages';
import { useTheme } from '@/constants/theme';
import { useGameplayPrefs } from '@/features/settings/useGameplayPrefs';
import { clockRemaining, isGuest, playClient, usePlay } from '@/lib/playClient';
import { onlineGamePgn, useRecordOnlineGame } from '@/lib/recordGame';
import { useLowTimeWarning } from '@/lib/feedback';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { useGameChat } from '@/lib/useGameChat';
import { usePlayBoard } from '@/lib/usePlayBoard';
import { dirIcon, useT } from '@/i18n';
import { useReviewEntry } from '@/features/engine/useReviewEntry';
import { KeyboardScrollView } from '@/ui/components/Keyboard';
import { ShareGameButton, type GameShare } from '@/features/share/ShareGame';
import { vsTitle } from '@/features/share/gameShares';

type Popup = 'chat' | 'more' | 'draw' | 'abort' | 'resign' | 'rematch' | 'frenzy';

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
  const { width: winW, height: winH } = useWindowDimensions();
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
  // A finished game stays in the play state until it is dismissed. Opening this
  // screen to set up a challenge, open an invite or quick-pair must not land on
  // that old result, so a game already over on arrival is set aside.
  const intent = mode === 'friend' || !!inviteId || !!tcParam;
  const [staleGameId] = useState(() => (intent && s.game?.outcome ? s.game.gameId : null));
  useEffect(() => {
    if (staleGameId && playClient.getState().game?.gameId === staleGameId) playClient.dismissFinished();
  }, [staleGameId]);
  const view = s.game && s.game.gameId !== staleGameId ? s.game : null;
  const size = useBoardSize(300);
  const live = !!view && !view.outcome;
  // No way back out mid-game (no back button, swipe or Android back); it returns when the game ends.
  const lockOptions = useGameLock(live);
  const now = useTicker(live || (!!view?.opponentAbandonAt && !view.opponentConnected) || s.seek !== null);
  useRecordOnlineGame(view);

  // Move and resign confirmation follow the user's gameplay settings.
  const prefs = useGameplayPrefs(view?.fen ?? START, timeCategory(view?.timeControl ?? quickTc ?? DEFAULT_TC), (uci) => playClient.move(uci));
  const board = usePlayBoard(view, prefs.move);
  const chat = useGameChat(view?.gameId ?? null, s.me?.id ?? null, playClient.send, playClient.onServerMessage);

  const [hideResult, setHideResult] = useState(false);
  const gameId = view?.gameId;
  useEffect(() => setHideResult(false), [gameId]);
  // Review is for signed-in players; once graded, the button shows the accuracy.
  const reviewEntry = useReviewEntry(view?.outcome ? { moves: view.history.map((m) => m.uci), gameId: view.gameId } : null);

  const you: Color = view?.you ?? 'w';
  const opp: Color = you === 'w' ? 'b' : 'w';
  const players = view ? { w: view.white, b: view.black } : null;
  const ms = (c: Color) => (view ? clockRemaining(view.clock, c, view.clockOffset, now) : null);
  const history = view?.history ?? [];
  const last = prefs.pending ?? history[history.length - 1];
  useLowTimeWarning(view?.gameId ?? null, live, ms(you), view?.timeControl.initialMs ?? 0);
  const abandonIn = view?.opponentAbandonAt ? Math.max(0, Math.ceil((view.opponentAbandonAt - (now + view.clockOffset)) / 1000)) : null;
  // Each side has 30 seconds for its first move; the server aborts the game after that.
  const firstMoveIn = live && view?.firstMoveDeadline ? Math.max(0, Math.ceil((view.firstMoveDeadline - (now + view.clockOffset)) / 1000)) : null;
  const toMove: Color = view?.fen.split(' ')[1] === 'b' ? 'b' : 'w';

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
  // Two hands shake over the board as a new game begins (not on a reconnect mid-game).
  const intro = useGameStartHandshake(live ? (gameId ?? null) : null, history.length);
  const [panel, setPanel] = useState<Popup | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [chatSeen, setChatSeen] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  useEffect(() => {
    setPanel(null);
    setFlipped(false);
    setReporting(false);
    setReported(false);
  }, [gameId]);
  const lastLine = chat.lines[chat.lines.length - 1];
  const unread = panel !== 'chat' && chat.lines.length > chatSeen && !!lastLine && lastLine.playerId !== me?.id;
  const toggle = (p: Popup) => {
    if (p === 'chat' || panel === 'chat') setChatSeen(chat.lines.length);
    setPanel(panel === p ? null : p);
  };

  const title = view
    ? `${formatTimeControl(view.timeControl)} · ${view.variant === 'secretQueen' ? tr('secretQueen.name') : view.rated ? tr('play.rated') : tr('play.casual')}`
    : mode === 'friend' ? tr('home.friend.title') : tr('titles.playOnline');

  const sponsor = useTournamentSponsor(view?.tournamentId ?? null);
  const connectionNotice = s.restricted ? (
    <RestrictionBanner style={styles.restricted} />
  ) : s.closedReason ? (
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
        <Stack.Screen options={{ title, ...lockOptions, headerRight: undefined }} />
        <KeyboardScrollView contentContainerStyle={styles.page}>
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
        </KeyboardScrollView>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- the game
  const over = !!view.outcome;
  const orientation: Color = flipped ? opp : you;
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const shownMove = nav.shown > 0 ? history[nav.shown - 1] : undefined;
  const boardFen = nav.live ? (board.displayFen ?? view.fen) : (shownMove?.fenAfter ?? START);
  const boardLast = nav.live ? last : shownMove;
  // Follows the shown position, so it updates while browsing earlier moves.
  const material = materialBalance(boardFen);
  const materialOf = (c: Color) => ({ ...material[c], color: opposite(c) });
  const oppOfferedRematch = view.rematchBy === opp;
  const secretQueen = view.variant === 'secretQueen';
  // Secret Queen games are not reviewed or archived: pawns that moved like queens confuse the engine and the replay.
  const reviewable = over && view.outcome!.reason !== 'aborted' && history.length > 0 && !secretQueen;
  const crowned = secretQueen ? (over && view.endSecrets ? [view.endSecrets.w, view.endSecrets.b].filter((x): x is NonNullable<typeof x> => !!x) : view.secret ? [view.secret] : []) : undefined;
  const revealText = (r: (typeof view.reveals)[number]) =>
    tr(`secretQueen.revealed.${r.reason}`, { side: r.color === 'w' ? tr('play.white') : tr('play.black'), square: r.square });

  const openReview = () =>
    reviewEntry.press(() => {
      // The result popup is a modal: close it, or it stays on top of the review.
      setHideResult(true);
      router.push({
        pathname: '/review',
        params: {
          gameId: view.gameId,
          moves: history.map((m) => m.uci).join(','),
          orientation: view.you,
          white: view.white.name,
          black: view.black.name,
          whiteRating: String(view.white.rating),
          blackRating: String(view.black.rating),
          accounts: `${hasProfile(view.white) ? 'w' : ''}${hasProfile(view.black) ? 'b' : ''}`,
          result: view.outcome?.result,
        },
      });
    });
  const confirmThen = (fn: () => void) => () => {
    setPanel(null);
    fn();
  };

  // While playing: a link to watch along, but no PGN (pasting the moves into an engine mid-game
  // is the easiest cheat there is). Once over: the game's own page and its PGN. Aborted games
  // are not kept, and Secret Queen games can't be replayed, so those have nothing to share.
  const share: GameShare | null =
    over && (view.outcome!.reason === 'aborted' || secretQueen)
      ? null
      : {
          title: vsTitle(players.w.name, players.b.name),
          live: !over,
          link: over ? gamePath(view.gameId) : watchPath(view.gameId),
          keepLink: gamePath(view.gameId),
          pgn: over ? () => onlineGamePgn({ ...view, outcome: view.outcome! }) : null,
          pgnNote: secretQueen ? tr('share.noPgnSecretQueen') : undefined,
        };

  // Frenzy: in tournaments that allow it, before your own first move.
  const canFrenzy = !over && view.frenzyAllowed && !view.frenzy[you] && history.length < (you === 'w' ? 1 : 2);
  const actions: GameAction[] = [
    { key: 'more', icon: 'dots-horizontal', label: tr('game.action.more'), onPress: () => toggle('more'), active: panel === 'more' },
    { key: 'chat', icon: 'chat-outline', label: tr('game.action.chat'), onPress: () => toggle('chat'), active: panel === 'chat', dot: unread },
    ...(!over
      ? history.length < 2
        ? [{ key: 'abort', icon: 'close-circle-outline' as const, label: tr('game.action.abort'), onPress: () => toggle('abort'), active: panel === 'abort' }]
        : [{ key: 'draw', icon: 'handshake-outline' as const, label: tr('game.action.draw'), onPress: () => toggle('draw'), active: panel === 'draw', disabled: view.drawOfferBy === you || view.drawOfferBy === opp, dot: view.drawOfferBy === opp }]
      : [{ key: 'review', icon: 'chart-box-outline' as const, label: tr('game.action.review'), review: true, onPress: openReview, disabled: !reviewable }]),
    ...(canFrenzy
      ? [{ key: 'frenzy', icon: 'lightning-bolt' as const, label: tr('tournaments.frenzy.button'), onPress: () => toggle('frenzy'), active: panel === 'frenzy' }]
      : []),
    !over
      ? { key: 'resign', icon: 'flag-outline', label: tr('game.action.resign'), onPress: () => toggle('resign'), active: panel === 'resign', disabled: history.length < 2, danger: true }
      : {
          key: 'rematch',
          icon: 'refresh',
          label: tr('game.action.rematch'),
          onPress: () => toggle('rematch'),
          active: panel === 'rematch',
          dot: oppOfferedRematch,
          disabled: !oppOfferedRematch && (view.rematchBy === you || view.rematchDeclined || !view.opponentConnected),
        },
    { key: 'back', icon: dirIcon('chevron-left'), label: tr('game.action.back'), onPress: nav.back, disabled: !nav.canBack, repeat: true },
    { key: 'forward', icon: dirIcon('chevron-right'), label: tr('game.action.forward'), onPress: nav.forward, disabled: !nav.canForward, repeat: true },
  ];

  const opponent = players[opp];
  // Same report sheet as the chat's: reason, optional note; the report carries this game's moves and chat.
  const canReport = !!me && opponent.id !== me.id;
  const moreItems: OptionItem[] = [
    { key: 'flip', icon: 'swap-vertical', label: tr('game.more.flip'), onPress: () => setFlipped((f) => !f) },
    ...(view.premoves.length ? [{ key: 'premove', icon: 'cancel' as const, label: tr('game.more.cancelPremove'), onPress: () => playClient.clearPremoves() }] : []),
    ...(over
      ? [
          ...(hideResult ? [{ key: 'result', icon: 'trophy-outline' as const, label: tr('game.over.showResult'), onPress: () => { setHideResult(false); setPanel(null); } }] : []),
          { key: 'new', icon: 'plus-circle-outline' as const, label: tr('game.more.newGame', { tc: formatTimeControl(view.timeControl) }), onPress: newGame },
          ...(view.outcome!.reason !== 'aborted' && !secretQueen
            ? [{ key: 'history', icon: 'history' as const, label: tr('game.more.reviewHistory'), onPress: () => router.push({ pathname: '/games/[id]', params: { id: `on_${view.gameId}` } }) }]
            : []),
          ...(view.tournamentId
            ? [{ key: 'tournament', icon: 'trophy-outline' as const, label: tr('tournaments.back'), onPress: () => router.dismissTo({ pathname: '/tournaments/[id]', params: { id: view.tournamentId! } }) }]
            : []),
          { key: 'lobby', icon: 'home-outline' as const, label: tr('game.more.lobby'), onPress: toLobby },
        ]
      : []),
    ...(canReport
      ? [{ key: 'report', icon: 'flag-outline' as const, label: reported ? tr('game.more.reported') : tr('game.more.report', { name: opponent.name }), onPress: () => setReporting(true), disabled: reported, danger: true }]
      : []),
  ];

  const notices = (
    <>
      {live && prefs.pending && (
        <BoardNotice icon="help-circle-outline" text={tr('play.confirmMoveQ', { san: prefs.pending.san })} strong>
          <NoticeButton icon="close" label={tr('common.cancel')} onPress={prefs.cancel} />
          <NoticeButton icon="check" label={tr('play.confirmMove')} onPress={prefs.confirm} primary />
        </BoardNotice>
      )}
      {live && view.drawOfferBy === opp && (
        <BoardNotice icon="handshake-outline" text={tr('play.online.drawOffered')} strong>
          <NoticeButton icon="close" label={tr('common.decline')} onPress={playClient.declineDraw} />
          <NoticeButton icon="check" label={tr('common.accept')} onPress={playClient.acceptDraw} primary />
        </BoardNotice>
      )}
      {live && view.drawOfferBy === you && <BoardNotice icon="handshake-outline" text={`${tr('game.draw.offered')}. ${tr('game.draw.offeredBody')}`} />}
      {!view.opponentConnected && live && (
        <BoardNotice
          icon="wifi-off"
          text={history.length < 2 ? tr('play.online.oppGoneEarly') : abandonIn !== null ? tr('play.online.oppGoneWin', { n: abandonIn }) : tr('play.online.oppGoneWait')}
        />
      )}
      {live && secretQueen && board.picking && <BoardNotice icon="crown-outline" text={tr('secretQueen.pick')} strong />}
      {live && secretQueen && !board.picking && view.secret && history.length < 2 && <BoardNotice icon="crown" text={tr('secretQueen.chosen', { square: view.secret })} />}
      {secretQueen && view.lastReveals.length > 0 && nav.live && <BoardNotice icon="eye-outline" text={view.lastReveals.map(revealText).join(' ')} />}
      {firstMoveIn !== null && view.opponentConnected && (
        <BoardNotice
          icon="timer-sand"
          text={toMove === you ? tr('play.online.firstMoveYou', { n: firstMoveIn }) : tr('play.online.firstMoveOpp', { name: players[opp].name, n: firstMoveIn })}
          strong={toMove === you}
        />
      )}
      {s.error && <BoardNotice icon="alert-circle-outline" text={serverText(s.error)} />}
    </>
  );
  const hasNotice =
    (live && (!!prefs.pending || !!view.drawOfferBy || !view.opponentConnected || firstMoveIn !== null || (secretQueen && (board.picking || (!!view.secret && history.length < 2))))) ||
    (secretQueen && view.lastReveals.length > 0) ||
    !!s.error;
  const firstMoveStatus = (c: Color) =>
    [firstMoveIn !== null && c === toMove ? tr('play.online.firstMoveCountdown', { n: firstMoveIn }) : null, view.frenzy[c] ? `⚡ ${tr('tournaments.frenzy.active')}` : null].filter(Boolean).join(' · ') || null;
  const oppName = players[opp].name;

  const popover =
    panel === 'chat' ? (
      <View style={{ height: 340 }}>
        <ChatPanel chat={chat} me={me} opponent={players[opp]} canChat fill onClose={() => toggle('chat')} />
      </View>
    ) : panel === 'more' ? (
      <OptionsPanel title={tr('game.more.title')} onClose={() => setPanel(null)} items={moreItems.map((it) => ({ ...it, onPress: confirmThen(it.onPress) }))} />
    ) : panel === 'draw' ? (
      <ConfirmPanel icon="handshake-outline" title={tr('game.confirm.drawTitle')} body={tr('game.confirm.drawBody')} confirmLabel={tr('game.confirm.draw')} onConfirm={confirmThen(playClient.offerDraw)} onCancel={() => setPanel(null)} />
    ) : panel === 'frenzy' ? (
      <ConfirmPanel icon="lightning-bolt" title={tr('tournaments.frenzy.button')} body={tr('tournaments.frenzy.hint')} confirmLabel={tr('tournaments.frenzy.button')} onConfirm={confirmThen(playClient.frenzy)} onCancel={() => setPanel(null)} />
    ) : panel === 'abort' ? (
      <ConfirmPanel icon="close-circle-outline" title={tr('game.confirm.abortTitle')} body={tr('game.confirm.abortBody')} confirmLabel={tr('game.confirm.abort')} onConfirm={confirmThen(playClient.abort)} onCancel={() => setPanel(null)} danger />
    ) : panel === 'resign' ? (
      <ConfirmPanel icon="flag-outline" title={tr('game.resign.title')} body={tr('game.resign.body')} confirmLabel={tr('game.resign.confirm')} onConfirm={confirmThen(playClient.resign)} onCancel={() => setPanel(null)} danger />
    ) : panel === 'rematch' ? (
      <ConfirmPanel
        icon="refresh"
        title={oppOfferedRematch ? tr('game.confirm.acceptRematchTitle') : tr('game.confirm.rematchTitle')}
        body={oppOfferedRematch ? tr('game.confirm.acceptRematchBody', { name: oppName }) : tr('game.confirm.rematchBody', { name: oppName })}
        confirmLabel={oppOfferedRematch ? tr('game.confirm.acceptRematch') : tr('game.confirm.rematch')}
        onConfirm={confirmThen(() => playClient.rematch())}
        onCancel={() => setPanel(null)}
      />
    ) : null;

  return (
    <Screen>
      <Stack.Screen options={{ title, ...lockOptions, headerRight: () => <ShareGameButton share={share} /> }} />
      <GameLayout
        notice={
          <>
            {connectionNotice}
            {sponsor ? (
              <View style={styles.sponsor}>
                <SponsorBadge sponsor={sponsor} size="lg" align="center" />
              </View>
            ) : null}
          </>
        }
        top={<PlayerCard player={players[top]} ms={ms(top)} active={view.clock.running === top} offline={top === opp && !view.opponentConnected} status={firstMoveStatus(top)} material={materialOf(top)} />}
        bottom={<PlayerCard player={players[orientation]} ms={ms(orientation)} active={view.clock.running === orientation} offline={orientation === opp && !view.opponentConnected} status={firstMoveStatus(orientation)} material={materialOf(orientation)} />}
        renderBoard={(boardSize) => (
          <>
            <Board
              fen={boardFen}
              orientation={orientation}
              size={boardSize}
              selected={nav.live ? board.selected : null}
              targets={nav.live ? board.targets : []}
              premoves={nav.live ? view.premoves : null}
              crowned={nav.live || over ? crowned : undefined}
              pickable={nav.live ? board.pickable : undefined}
              lastMove={boardLast ? { from: boardLast.from, to: boardLast.to } : null}
              checkSquare={checkSquareOf(boardFen)}
              onSquarePress={nav.live ? board.onSquarePress : undefined}
              {...(nav.live ? board.dragProps : {})}
            />
            {intro.active && <GameStartHandshake size={boardSize} white={players.w.name} black={players.b.name} cut={intro.cut} onDone={intro.done} sponsor={sponsor} />}
            {/* The result opens full screen (ResultPopup below) so everything fits without scrolling. */}
          </>
        )}
        strip={
          <MoveStrip
            sans={history.map((m) => m.san)}
            shown={nav.shown}
            onSelect={nav.goTo}
            onLive={nav.toLive}
            empty={live ? (you === 'w' ? tr('play.online.firstMoveWhite') : tr('play.online.firstMoveBlack')) : undefined}
          />
        }
        notices={hasNotice && nav.live ? notices : null}
        popover={popover}
        onDismissPopover={() => setPanel(null)}
        actions={actions}
      />
      {canReport && (
        <ReportDialog
          visible={reporting}
          player={opponent}
          onClose={() => setReporting(false)}
          onSubmit={async (reason, note) => {
            const ok = await chat.report(opponent.id, reason, note);
            if (ok) setReported(true);
            return ok;
          }}
        />
      )}
      <ResultPopup visible={over && !hideResult} onClose={() => setHideResult(true)}>
        {/* The popup fades out after a rematch or new game starts: only draw the card while there is a result. */}
        {over && (
          <GameOverCard
            view={view}
            onRematch={() => playClient.rematch()}
            onDeclineRematch={() => playClient.declineRematch()}
            onNewGame={newGame}
            onLobby={toLobby}
            onReview={reviewable ? openReview : undefined}
            reviewLabel={reviewEntry.label ?? undefined}
            onClose={() => setHideResult(true)}
            sponsor={sponsor}
            onTournament={
              view.tournamentId
                ? () => {
                    // Back to the tournament page already open below (or open it), without stacking another one.
                    setHideResult(true);
                    router.dismissTo({ pathname: '/tournaments/[id]', params: { id: view.tournamentId! } });
                  }
                : undefined
            }
          />
        )}
        {over && endResult(view) && (
          <GameEndCelebration key={view.gameId} result={endResult(view)!} reason={view.outcome!.reason} score={view.outcome!.result} seed={view.gameId} width={winW} height={winH} />
        )}
      </ResultPopup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  banner: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2, marginHorizontal: 12, marginTop: 8 },
  restricted: { marginHorizontal: 12, marginTop: 8 },
  sponsor: { paddingTop: 8, paddingBottom: 4, paddingHorizontal: 12 },
  // The result card scrolls inside the board when it is taller than the board (small phones).
  overlayScroll: { width: '100%', maxHeight: '100%' },
  overlayContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 6 },
});
