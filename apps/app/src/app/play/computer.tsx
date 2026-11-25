import { Game, START_FEN, analysisPath, linePgn, type BotBandId, type Color, type GameOutcome, type PlayedMove } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useGameLock } from '@/lib/useGameLock';
import { ResultPopup } from '@/components/play/ResultPopup';
import { BreakBanner, usePlayLock } from '@/components/BreakBanner';
import { currentPlayLock, reportComputerGame } from '@/lib/habits';
import { Text } from '@/ui/primitives';
import { Badge, Chip, rimShadow, useToast } from '@/ui';

import { Board } from '@/components/Board';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { useMoveFeedback } from '@/lib/feedback';
import { AbortError, localEngine } from '@/features/engine/localEngine';
import { useReviewEntry } from '@/features/engine/useReviewEntry';
import { BotAvatar } from '@/features/bots/BotAvatar';
import { botMove, usesStockfish } from '@/features/bots/botMove';
import { allOpponents, byBand, defaultOpponent, onlineBotId, onlineOpponent, type Opponent } from '@/features/bots/opponents';
import { reportOnlineBotResult, useOnlineBots } from '@/features/bots/store';
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
import { GameStartHandshake, HANDSHAKE_MS, useGameStartHandshake } from '@/components/play/GameStartHandshake';
import { Segmented as SegmentedControl } from '@/components/play/Controls';
import { ShareGameButton, type GameShare } from '@/features/share/ShareGame';
import { vsTitle } from '@/features/share/gameShares';

/** The bot's one line: its own for an online bot, translated for a built-in one. */
const botTagline = (b: Opponent) => (b.kind === 'online' ? (b.tagline ?? '') : translate(`bots.taglines.${b.id}` as TKey));

/** "~1650 · Club", the line under a bot's name everywhere. */
const ratingLine = (b: Pick<Opponent, 'rating' | 'band'>) => translate('computer.bandRating', { rating: b.rating, band: translate(`bots.bands.${b.band}`) });

type ColorChoice = 'w' | 'random' | 'b';

interface Setup {
  bot: Opponent;
  color: Color;
}

/** The last opponent and colour picked, so "change opponent" opens where the player left off. */
let lastChoice: { id: string; color: ColorChoice } | null = null;

/** Roughly how strong ChessMate's own search plays a Stockfish bot on a device that cannot run Stockfish. */
const FALLBACK_RATING = 2200;

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
      {/* The game sets its own header button (Share); back on the setup screen there is none. */}
      <Stack.Screen options={setup ? { title: tr('titles.computer') } : { title: tr('titles.computer'), headerRight: undefined }} />
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
  const user = useCurrentUser();
  const online = useOnlineBots();
  const all = useMemo(() => allOpponents(online.bots), [online.bots]);
  const groups = useMemo(() => byBand(all), [all]);
  // Featured online bots in the order staff set them, ahead of everything else.
  const featured = useMemo(() => online.bots.filter((b) => b.featured).map(onlineOpponent), [online.bots]);
  const fallback = defaultOpponent(user.status === 'signedIn' ? user.rating : null);
  const [botId, setBotId] = useState(lastChoice?.id ?? fallback.id);
  const [color, setColor] = useState<ColorChoice>(lastChoice?.color ?? 'w');
  // A remembered online bot that is gone (switched off, or offline now) falls back quietly.
  const bot = all.find((b) => b.id === botId) ?? fallback;
  const [band, setBand] = useState<BotBandId>(bot.band);
  const shown = groups.find((g) => g.band.id === band)?.opponents ?? [];
  const bandInfo = groups.find((g) => g.band.id === band)?.band;
  // Known already this session: the strong bots will play weaker on this device.
  const weakerHere = !localEngine.usable && usesStockfish(bot) && bot.rating > FALLBACK_RATING;

  const choose = (b: Opponent) => {
    setBotId(b.id);
    setBand(b.band);
  };
  const start = () => {
    lastChoice = { id: bot.id, color };
    const c: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    onStart({ bot, color: c });
  };
  const visit = (url: string) => void Linking.openURL(url).catch(() => {});

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <Label size={26} bold>
          {tr('computer.choose')}
        </Label>
        <Label muted>{tr('computer.intro')}</Label>

        {featured.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.overline, { color: t.muted }]}>{tr('computer.featured')}</Text>
            <View style={styles.botGrid}>
              {featured.map((b) => {
                const active = b.id === bot.id;
                return (
                  <View key={b.id} style={styles.botCell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={tr('computer.botA11y', { name: b.name, band: tr(`bots.bands.${b.band}`), rating: b.rating })}
                      onPress={() => choose(b)}
                      style={({ pressed }) => [
                        styles.featuredCard,
                        { backgroundColor: active ? t.accent : t.surface, borderColor: active ? t.accent : t.glassBorder, opacity: pressed ? 0.85 : 1 },
                        rimShadow(t, active ? 'bright' : 'soft'),
                      ]}>
                      <BotAvatar bot={b} size={64} inverted={active} />
                      <Text numberOfLines={1} style={[styles.botName, { color: active ? t.onAccent : t.text }]}>
                        {b.name}
                      </Text>
                      {b.tag ? <Badge label={tr(`chessTitle.roleTags.${b.tag}`)} tone={active ? 'outline' : 'solid'} /> : null}
                      <Text style={[styles.botMeta, { color: active ? t.onAccent : t.muted }]}>{ratingLine(b)}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ gap: 6 }}>
          <View style={styles.bands}>
            {groups.map((g) => (
              <Chip key={g.band.id} label={tr(`bots.bands.${g.band.id}`)} selected={g.band.id === band} onPress={() => setBand(g.band.id)} />
            ))}
          </View>
          {bandInfo ? (
            <Text style={[styles.botMeta, { color: t.muted }]}>
              {tr('computer.bandRange', { band: tr(`bots.bands.${bandInfo.id}`), min: bandInfo.min, max: bandInfo.max })}
            </Text>
          ) : null}
        </View>
        {online.status === 'offline' && (
          <Text style={[styles.botMeta, { color: t.muted }]}>{tr('computer.onlineBotsOffline')}</Text>
        )}

        <View style={styles.botGrid}>
          {shown.map((b) => {
            const active = b.id === bot.id;
            return (
              <View key={b.id} style={styles.botCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tr('computer.botA11y', { name: b.name, band: tr(`bots.bands.${b.band}`), rating: b.rating })}
                  onPress={() => choose(b)}
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
                  <View style={styles.tileTop}>
                    <BotAvatar bot={b} inverted={active} />
                    {b.kind === 'online' ? <Badge label={b.tag ? tr(`chessTitle.roleTags.${b.tag}`) : tr('computer.online')} tone={active ? 'outline' : 'solid'} /> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.botName, { color: active ? t.onAccent : t.text }]}>
                    {b.name}
                  </Text>
                  <Text style={[styles.botMeta, { color: active ? t.onAccent : t.muted }]}>
                    {tr('computer.tileMeta', { rating: b.rating, style: tr(`bots.styles.${b.style}`) })}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Card>
          <View style={styles.row}>
            <BotAvatar bot={bot} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                <Label size={18} bold>
                  {bot.name}
                </Label>
                {bot.tag ? <Badge label={tr(`chessTitle.roleTags.${bot.tag}`)} tone="solid" /> : null}
              </View>
              <Label muted>{tr('computer.detailMeta', { line: ratingLine(bot), style: tr(`bots.styles.${bot.style}`) })}</Label>
            </View>
          </View>
          {botTagline(bot) ? <Label>{botTagline(bot)}</Label> : null}
          <Label muted>{tr(`bots.styleHint.${bot.style}`)}</Label>
          {weakerHere ? <Label muted>{tr('computer.deviceFallback', { name: bot.name, rating: FALLBACK_RATING })}</Label> : null}
          {bot.url ? (
            <Pressable accessibilityRole="link" onPress={() => visit(bot.url!)} style={({ pressed }) => [styles.visit, { borderColor: t.glassBorder, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[styles.botMeta, { color: t.text, fontWeight: '700' }]}>{tr('computer.visit', { host: hostOf(bot.url) })}</Text>
            </Pressable>
          ) : null}

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

/** "twitch.tv/name" from a link, for the visit button. */
function hostOf(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return <SegmentedControl value={value} onChange={onChange} options={options} />;
}

// -------------------------------------------------------------------- game

interface GameView {
  fen: string;
  history: PlayedMove[];
}

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
  const toast = useToast();
  /** True once this device has played the bot without Stockfish: weaker than its rating, and the card says so. */
  const [reduced, setReduced] = useState(false);
  const warned = useRef(false);

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
  // Each mount is a new game (the screen remounts it for a rematch).
  const [gameKey] = useState(() => `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
  const intro = useGameStartHandshake(gameKey, view.history.length);

  // Bot's turn: think after a short pause so the player's move is visible.
  useEffect(() => {
    if (outcome || snapshot.turn === me) return;
    const token = ++epoch.current;
    const abort = new AbortController();
    setThinking(true);
    const moves = game.current.uciHistory();
    // Playing black, the computer waits for the handshake before its first move.
    const pause = 250 + Math.min(450, Math.round(bot.rating / 8)) + (intro.active && moves.length === 0 ? HANDSHAKE_MS : 0);
    let rest: ReturnType<typeof setTimeout> | undefined;
    const id = setTimeout(() => {
      if (token !== epoch.current) return;
      const started = Date.now();
      botMove(bot, moves, { signal: abort.signal }).then(
        (m) => {
          if (token !== epoch.current) return;
          if (m.source === 'fallback' && !warned.current && bot.rating > FALLBACK_RATING) {
            warned.current = true;
            setReduced(true);
            toast.show({ title: tr('computer.deviceFallback', { name: bot.name, rating: FALLBACK_RATING }) });
          }
          // Keep a natural rhythm: no bot answers instantly.
          rest = setTimeout(
            () => {
              if (token !== epoch.current) return;
              game.current.move(m.uci);
              setThinking(false);
              sync();
            },
            Math.max(0, 350 - (Date.now() - started)),
          );
        },
        (e: unknown) => {
          if (!(e instanceof AbortError)) console.warn('[computer] no move', e);
        },
      );
    }, pause);
    return () => {
      clearTimeout(id);
      if (rest) clearTimeout(rest);
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fen, outcome?.reason]);

  // Stockfish bots: start the engine now and keep it running for the whole game.
  const over = !!outcome;
  useEffect(() => {
    if (over || !usesStockfish(bot)) return;
    localEngine.warmUp();
    return localEngine.hold();
  }, [over, bot]);

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
  useEffect(() => {
    if (!outcome) return;
    // Counts for the streak and the play limit (signed-in players).
    void reportComputerGame(view.history.length);
    // Online bots show staff how often they are played.
    const online = onlineBotId(bot);
    if (online && view.history.length >= 2) reportOnlineBotResult(online, outcome.winner === null ? 'draw' : outcome.winner === me ? 'win' : 'loss');
  }, [outcome?.reason]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviewEntry = useReviewEntry(outcome ? { moves: view.history.map((m) => m.uci) } : null);

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
  const openReview = () =>
    reviewEntry.press(() => {
      // The result popup is a modal: close it, or it stays on top of the review.
      setHideResult(true);
      router.push({
        pathname: '/review',
        params: {
          moves: view.history.map((m) => m.uci).join(','),
          orientation: me,
          white: me === 'w' ? user.displayName : bot.name,
          black: me === 'b' ? user.displayName : bot.name,
          result: outcome?.result,
        },
      });
    });

  const botCard = (
    <PlayerCard
      player={{ id: `bot_${bot.id}`, name: bot.name, rating: bot.rating, provisional: false }}
      avatar={<BotAvatar bot={bot} size={36} />}
      subtitle={reduced ? tr('computer.reducedLine', { line: ratingLine(bot), rating: FALLBACK_RATING }) : ratingLine(bot)}
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

  // Not kept on the server: the link carries the moves to the analysis board.
  const whiteName = me === 'w' ? user.displayName || tr('computer.you') : bot.name;
  const blackName = me === 'b' ? user.displayName || tr('computer.you') : bot.name;
  const moves = view.history.map((m) => m.uci);
  const share: GameShare = {
    title: vsTitle(whiteName, blackName),
    link: analysisPath({ moves }),
    pgn: () =>
      linePgn({
        moves,
        white: whiteName,
        black: blackName,
        whiteRating: me === 'w' ? null : bot.rating,
        blackRating: me === 'b' ? null : bot.rating,
        result: outcome?.result ?? '*',
        reason: outcome?.reason ?? null,
        tags: { Event: 'ChessMate vs computer' },
      }),
  };

  return (
    <>
      <Stack.Screen options={{ ...lockOptions, headerRight: () => <ShareGameButton share={share} /> }} />
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
            {intro.active && (
              <GameStartHandshake
                size={size}
                white={me === 'w' ? user.displayName || tr('computer.you') : bot.name}
                black={me === 'b' ? user.displayName || tr('computer.you') : bot.name}
                cut={intro.cut}
                onDone={intro.done}
              />
            )}
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
            eyebrow={ratingLine(bot)}
            white={me === 'w' ? user.displayName || tr('computer.you') : bot.name}
            black={me === 'b' ? user.displayName || tr('computer.you') : bot.name}
            onClose={() => setHideResult(true)}>
            {plyCount > 0 && (
              <View style={styles.resultButtons}>
                <NoticeButton icon="chart-box-outline" label={reviewEntry.label ?? tr('play.over.reviewGame')} onPress={openReview} primary wide />
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
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  overline: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  featuredCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6, alignItems: 'center' },
  bands: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  visit: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  segmented: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  overlayScroll: { width: '100%', maxHeight: '100%' },
  overlayContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 6 },
  result: { width: '100%', maxWidth: 460, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  resultButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
