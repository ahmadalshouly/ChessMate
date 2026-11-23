import { BOTS, Game, START_FEN, chooseBotMove, type BotProfile, type Color, type GameOutcome, type PlayedMove } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useGameLock } from '@/lib/useGameLock';
import { ResultPopup } from '@/components/play/ResultPopup';
import { BreakBanner, usePlayLock } from '@/components/BreakBanner';
import { currentPlayLock, reportComputerGame } from '@/lib/habits';
import { Text } from '@/ui/primitives';
import { rimShadow } from '@/ui';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useMoveFeedback } from '@/lib/feedback';
import { PREPARE_DELAY_MS, prepareReview } from '@/features/engine';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useCurrentUser } from '@/lib/currentUser';
import { dirIcon, translate, useT, type TKey } from '@/i18n';
import { colorLabel } from '@/i18n/chess';
import { type GameAction } from '@/components/game/ActionBar';
import { GameLayout } from '@/components/game/GameLayout';
import { MoveStrip } from '@/components/game/MoveStrip';
import { ConfirmPanel, NoticeButton, OptionsPanel, type OptionItem } from '@/components/game/Panels';
import { PlayerCard } from '@/components/game/PlayerCard';
import { useHistoryNav } from '@/components/game/useHistoryNav';
import { reasonText } from '@/components/play/GameOverCard';
import { GameEndCelebration } from '@/components/play/GameEndCelebration';
import { ResultHeader, Scoreline, STAMP_MS, useCardEntrance, type EndResult } from '@/components/play/ResultBadges';
import { Segmented as SegmentedControl } from '@/components/play/Controls';

const botTagline = (b: BotProfile) => translate(`bots.${b.id}` as TKey);

type ColorChoice = 'w' | 'random' | 'b';

interface Setup {
  bot: BotProfile;
  color: Color;
}

/**
 * Unrated practice against ChessMate's built-in computer opponents. The
 * engine runs on device, so it works offline and costs no server time.
 */
export default function PlayComputer() {
  const tr = useT();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [round, setRound] = useState(0);
  // The player's play limit covers games against the computer too.
  const { until } = usePlayLock();
  const begin = (s: Setup) => {
    if (currentPlayLock()) return setSetup(null);
    setRound((r) => r + 1);
    setSetup(s);
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('titles.computer') }} />
      {setup ? (
        <ComputerGame key={round} setup={setup} onExit={() => setSetup(null)} onRematch={begin} />
      ) : until ? (
        <ScrollView contentContainerStyle={styles.page}>
          <BreakBanner />
        </ScrollView>
      ) : (
        <BotPicker onStart={begin} />
      )}
    </Screen>
  );
}

// ------------------------------------------------------------------ picker

function BotPicker({ onStart }: { onStart: (s: Setup) => void }) {
  const t = useTheme();
  const tr = useT();
  const [botId, setBotId] = useState(BOTS[2]!.id);
  const [color, setColor] = useState<ColorChoice>('w');
  const bot = BOTS.find((b) => b.id === botId)!;

  const start = () => {
    const c: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    onStart({ bot, color: c });
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <Label size={26} bold>
          {tr('computer.choose')}
        </Label>
        <Label muted>{tr('computer.intro')}</Label>

        <View style={styles.botGrid}>
          {BOTS.map((b) => {
            const active = b.id === botId;
            return (
              <View key={b.id} style={styles.botCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tr('computer.botA11y', { name: b.name, level: b.level, rating: b.rating })}
                  onPress={() => setBotId(b.id)}
                  style={({ pressed }) => [
                    styles.botTile,
                    {
                      backgroundColor: active ? t.accent : t.surface,
                      borderColor: active ? t.accent : t.glassBorder,
                      opacity: pressed ? 0.8 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                    rimShadow(t, active ? 'bright' : 'soft'),
                  ]}>
                  <Avatar bot={b} inverted={active} />
                  <Text style={[styles.botName, { color: active ? t.onAccent : t.text }]}>{b.name}</Text>
                  <Text style={[styles.botMeta, { color: active ? t.onAccent : t.muted }]}>
                    {tr('computer.levelRating', { level: b.level, rating: b.rating })}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Card>
          <View style={styles.row}>
            <Avatar bot={bot} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Label size={18} bold>
                {bot.name}
              </Label>
              <Label muted>{botTagline(bot)}</Label>
            </View>
          </View>

          <Label bold>{tr('computer.playAs')}</Label>
          <Segmented
            value={color}
            onChange={setColor}
            options={[
              { value: 'w', label: tr('play.white') },
              { value: 'random', label: tr('play.random') },
              { value: 'b', label: tr('play.black') },
            ]}
          />

          <Button title={tr('computer.playBot', { name: bot.name })} onPress={start} />
        </Card>
      </View>
    </ScrollView>
  );
}

function Avatar({ bot, size = 40, inverted }: { bot: BotProfile; size?: number; inverted?: boolean }) {
  const t = useTheme();
  // Ring thickness grows with level: a quiet visual cue for strength.
  const ring = 1 + Math.floor(bot.level / 3);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: inverted ? t.onAccent : t.text,
        backgroundColor: inverted ? 'transparent' : t.surfaceSolid,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: inverted ? t.onAccent : t.text, fontSize: size * 0.42, fontWeight: '700' }}>{bot.initial}</Text>
    </View>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return <SegmentedControl value={value} onChange={onChange} options={options} />;
}

// -------------------------------------------------------------------- game

interface GameView {
  fen: string;
  history: PlayedMove[];
}

/** Lets React paint (e.g. "Thinking…") before a blocking engine call. */
const nextFrame = (fn: () => void, delay = 0) => setTimeout(fn, delay);

function ComputerGame({ setup, onExit, onRematch }: { setup: Setup; onExit: () => void; onRematch: (s: Setup) => void }) {
  const tr = useT();
  const user = useCurrentUser();
  const win = useWindowDimensions();
  const { bot, color: me } = setup;
  const game = useRef(new Game());
  const [view, setView] = useState<GameView>(() => ({ fen: game.current.fen, history: [] }));
  const [flip, setFlip] = useState(me === 'b');
  const [resigned, setResigned] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [takebacks, setTakebacks] = useState(0);
  const [panel, setPanel] = useState<'more' | 'takeback' | 'resign' | 'rematch' | null>(null);
  const toggle = (p: 'more' | 'takeback' | 'resign' | 'rematch') => setPanel((cur) => (cur === p ? null : p));
  const confirmThen = (fn: () => void) => () => {
    setPanel(null);
    fn();
  };
  const [hideResult, setHideResult] = useState(false);
  /** Incremented to cancel a pending bot move (takeback, new game). */
  const epoch = useRef(0);

  const sync = () => setView({ fen: game.current.fen, history: game.current.history() });

  const snapshot = useMemo(() => new Game(view.fen), [view.fen]);
  const boardOutcome = useMemo<GameOutcome | null>(
    () => (view.history.length ? Game.fromUciMoves(view.history.map((m) => m.uci)).boardOutcome() : null),
    [view.history],
  );
  const outcome: GameOutcome | null = boardOutcome ?? (resigned ? { result: me === 'w' ? '0-1' : '1-0', reason: 'resignation', winner: me === 'w' ? 'b' : 'w' } : null);
  const myTurn = snapshot.turn === me && !outcome;
  const lockOptions = useGameLock(!outcome && view.history.length > 0);
  const nav = useHistoryNav(view.history.length);

  // Bot's turn: think after a short pause so the player's move is visible.
  useEffect(() => {
    if (outcome || snapshot.turn === me) return;
    const token = ++epoch.current;
    setThinking(true);
    const moves = game.current.uciHistory();
    const pause = 250 + Math.min(500, bot.level * 60);
    const id = nextFrame(() => {
      if (token !== epoch.current) return;
      const started = Date.now();
      const m = chooseBotMove(bot, { moves });
      // Keep a natural rhythm: weak bots never answer instantly.
      const rest = Math.max(0, 350 - (Date.now() - started));
      nextFrame(() => {
        if (token !== epoch.current) return;
        game.current.move(m.uci);
        setThinking(false);
        sync();
      }, rest);
    }, pause);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fen, outcome?.reason]);

  const play = (uci: string) => {
    if (!myTurn) return false;
    const ok = !!game.current.move(uci);
    if (ok) sync();
    return ok;
  };
  const interaction = useBoardInteraction(view.fen, (c) => c === me && myTurn, play);
  useMoveFeedback(view.history, !!outcome, {
    startCue: true,
    result: outcome ? (outcome.winner === null ? 'draw' : outcome.winner === me ? 'win' : 'loss') : undefined,
  });
  // Grade the game as soon as it ends (on the device where it can), so Review opens with every badge ready.
  useEffect(() => {
    if (!outcome) return;
    const moves = view.history.map((m) => m.uci);
    const id = setTimeout(() => prepareReview(moves), PREPARE_DELAY_MS);
    // Counts for the streak and the play limit (signed-in players).
    void reportComputerGame(view.history.length);
    return () => clearTimeout(id);
  }, [outcome?.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  // Takeback: return to the last position where it was the player's turn.
  const plyCount = view.history.length;
  const canTakeback = plyCount > 0 && !(plyCount === 1 && me === 'b');
  const takeback = () => {
    epoch.current++;
    setThinking(false);
    setResigned(false);
    setHideResult(false);
    interaction.clear();
    game.current.undo();
    if (game.current.turn !== me) game.current.undo();
    setTakebacks((n) => n + 1);
    nav.toLive();
    sync();
  };
  const resign = () => {
    epoch.current++;
    setThinking(false);
    setResigned(true);
  };
  const rematch = () => onRematch({ ...setup, color: me === 'w' ? 'b' : 'w' });

  const shownMove = nav.shown > 0 ? view.history[nav.shown - 1] : undefined;
  const boardFen = nav.live ? view.fen : (shownMove?.fenAfter ?? START_FEN);
  const verdict = outcome ? resultText(outcome, me) : null;
  const botColor: Color = me === 'w' ? 'b' : 'w';
  const orientation: Color = flip ? 'b' : 'w';
  const botOnTop = orientation === me;
  const openReview = () => {
    // The result popup is a modal: close it, or it stays on top of the review.
    setHideResult(true);
    router.push({
      pathname: '/review',
      params: {
        moves: view.history.map((m) => m.uci).join(','),
        orientation: me,
        white: me === 'w' ? user.displayName : bot.name,
        black: me === 'b' ? user.displayName : bot.name,
      },
    });
  };

  const botCard = (
    <PlayerCard
      player={{ id: `bot_${bot.id}`, name: bot.name, rating: bot.rating, provisional: false }}
      avatar={<Avatar bot={bot} size={36} />}
      subtitle={tr('computer.levelRating', { level: bot.level, rating: bot.rating })}
      status={thinking ? tr('computer.thinking') : null}
      active={!outcome && snapshot.turn === botColor}
      pressable={false}
    />
  );
  const youCard = (
    <PlayerCard
      player={{ id: user.status === 'signedIn' ? 'me' : 'g_me', name: user.displayName || tr('computer.you'), rating: 0, provisional: false }}
      subtitle={tr('computer.youSubtitle', { color: colorLabel(me) })}
      status={myTurn ? tr('computer.yourMove') : null}
      active={myTurn}
      pressable={user.status === 'signedIn'}
    />
  );

  const actions: GameAction[] = [
    { key: 'more', icon: 'dots-horizontal', label: tr('game.action.more'), onPress: () => toggle('more'), active: panel === 'more' },
    outcome
      ? { key: 'review', icon: 'chart-box-outline', label: tr('game.action.review'), onPress: openReview, disabled: plyCount === 0 }
      : { key: 'takeback', icon: 'undo-variant', label: tr('game.action.takeback'), onPress: () => toggle('takeback'), active: panel === 'takeback', disabled: !canTakeback },
    outcome
      ? { key: 'rematch', icon: 'refresh', label: tr('game.action.rematch'), onPress: () => toggle('rematch'), active: panel === 'rematch' }
      : { key: 'resign', icon: 'flag-outline', label: tr('game.action.resign'), onPress: () => toggle('resign'), active: panel === 'resign', disabled: plyCount < 1, danger: true },
    { key: 'back', icon: dirIcon('chevron-left'), label: tr('game.action.back'), onPress: nav.back, disabled: !nav.canBack, repeat: true },
    { key: 'forward', icon: dirIcon('chevron-right'), label: tr('game.action.forward'), onPress: nav.forward, disabled: !nav.canForward, repeat: true },
  ];
  const moreItems: OptionItem[] = [
    { key: 'flip', icon: 'swap-vertical', label: tr('game.more.flip'), onPress: () => setFlip((f) => !f) },
    ...(outcome && hideResult ? [{ key: 'result', icon: 'trophy-outline' as const, label: tr('game.over.showResult'), onPress: () => setHideResult(false) }] : []),
    { key: 'change', icon: 'account-switch-outline', label: tr('game.more.changeOpponent'), onPress: onExit },
  ];

  const lastShown = nav.live ? view.history[view.history.length - 1] : shownMove;

  return (
    <>
      <Stack.Screen options={lockOptions} />
      <GameLayout
        top={botOnTop ? botCard : youCard}
        bottom={botOnTop ? youCard : botCard}
        renderBoard={(size) => (
          <>
            <Board
              fen={boardFen}
              orientation={orientation}
              size={size}
              selected={nav.live ? interaction.selected : null}
              targets={nav.live ? interaction.targets : []}
              lastMove={lastShown ? { from: lastShown.from, to: lastShown.to } : null}
              checkSquare={checkSquareOf(boardFen)}
              onSquarePress={nav.live ? interaction.onSquarePress : undefined}
              {...(nav.live ? interaction.dragProps : {})}
            />
            {/* The result opens full screen (ResultPopup below) so everything fits without scrolling. */}
          </>
        )}
        strip={<MoveStrip sans={view.history.map((m) => m.san)} shown={nav.shown} onSelect={nav.goTo} onLive={nav.toLive} />}
        onDismissPopover={() => setPanel(null)}
        popover={
          panel === 'more' ? (
            <OptionsPanel title={tr('game.more.title')} onClose={() => setPanel(null)} items={moreItems.map((it) => ({ ...it, onPress: confirmThen(it.onPress) }))} />
          ) : panel === 'takeback' ? (
            <ConfirmPanel icon="undo-variant" title={tr('game.confirm.takebackTitle')} body={tr('game.confirm.takebackBody')} confirmLabel={tr('game.confirm.takeback')} onConfirm={confirmThen(takeback)} onCancel={() => setPanel(null)} />
          ) : panel === 'resign' ? (
            <ConfirmPanel icon="flag-outline" title={tr('game.resign.title')} body={tr('game.resign.body')} confirmLabel={tr('game.resign.confirm')} onConfirm={confirmThen(resign)} onCancel={() => setPanel(null)} danger />
          ) : panel === 'rematch' ? (
            <ConfirmPanel icon="refresh" title={tr('game.confirm.rematchTitle')} body={tr('game.confirm.rematchBody', { name: bot.name })} confirmLabel={tr('game.confirm.rematch')} onConfirm={confirmThen(rematch)} onCancel={() => setPanel(null)} />
          ) : null
        }
        actions={actions}
      />
      <ResultPopup visible={!!verdict && !hideResult} onClose={() => setHideResult(true)}>
        {verdict && outcome ? (
          <ComputerResultCard
            outcome={outcome}
            me={me}
            title={verdict.title}
            detail={`${reasonText(outcome.reason)} · ${tr('computer.unrated')}${takebacks ? ` · ${tr('computer.takebacks', { count: takebacks })}` : ''}`}
            eyebrow={tr('computer.levelRating', { level: bot.level, rating: bot.rating })}
            white={me === 'w' ? user.displayName || tr('computer.you') : bot.name}
            black={me === 'b' ? user.displayName || tr('computer.you') : bot.name}
            onClose={() => setHideResult(true)}>
            {plyCount > 0 && (
              <View style={styles.resultButtons}>
                <NoticeButton icon="chart-box-outline" label={tr('play.over.reviewGame')} onPress={openReview} primary wide />
              </View>
            )}
            <View style={styles.resultButtons}>
              <NoticeButton icon="refresh" label={tr('play.over.rematch')} onPress={rematch} primary={plyCount === 0} />
              <NoticeButton icon="account-switch-outline" label={tr('game.action.newGame')} onPress={onExit} />
            </View>
          </ComputerResultCard>
        ) : null}
        {verdict && outcome ? (
          <GameEndCelebration
            key={`${bot.id}-${plyCount}-${outcome.reason}`}
            result={outcome.winner === null ? 'draw' : outcome.winner === me ? 'win' : 'loss'}
            reason={outcome.reason}
            score={outcome.result}
            seed={`${bot.id}-${plyCount}-${outcome.reason}`}
            width={win.width}
            height={win.height}
          />
        ) : null}
      </ResultPopup>
    </>
  );
}

/** The vs-computer result: same crest, scoreline and entrance as an online game. */
function ComputerResultCard({
  outcome,
  me,
  title,
  detail,
  eyebrow,
  white,
  black,
  onClose,
  children,
}: {
  outcome: GameOutcome;
  me: Color;
  title: string;
  detail: string;
  eyebrow: string;
  white: string;
  black: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTheme();
  const result: EndResult = outcome.winner === null ? 'draw' : outcome.winner === me ? 'win' : 'loss';
  const enter = useCardEntrance(STAMP_MS);
  return (
    <Animated.View style={[styles.result, { backgroundColor: t.surfaceSolid, borderColor: t.glassBorder }, enter]}>
      <ResultHeader result={result} reason={outcome.reason} eyebrow={eyebrow} title={title} detail={detail} onClose={onClose} crestDelay={STAMP_MS + 300} />
      <Scoreline white={white} black={black} score={outcome.result} you={me} />
      {children}
    </Animated.View>
  );
}

function resultText(o: GameOutcome, me: Color): { title: string; detail: string } {
  const detail = `${o.result} ${reasonText(o.reason)}`;
  if (o.winner === null) return { title: translate('play.result.draw'), detail };
  return { title: translate(o.winner === me ? 'play.result.won' : 'play.result.lost'), detail };
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  botGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  botCell: { width: '50%', padding: 5 },
  botTile: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6, alignItems: 'flex-start' },
  botName: { fontSize: 16, fontWeight: '700' },
  botMeta: { fontSize: 13 },
  segmented: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  overlayScroll: { width: '100%', maxHeight: '100%' },
  overlayContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 6 },
  result: { width: '100%', maxWidth: 460, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  resultButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
