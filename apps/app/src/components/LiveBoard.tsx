import { formatClock, formatTimeControl, type Color, type PlayedMove, type PlayerInfo, type TimeControl } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Board } from '@/components/Board';
import { useTicker } from '@/components/PlayerBar';
import { useI18n } from '@/i18n';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { API_BASE } from '@/lib/leaderboardApi';
import { clockRemaining } from '@/lib/playClient';
import { useSpectate } from '@/lib/social/useSpectate';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

/** What `GET /api/live/featured` returns for a game in progress. */
export interface FeaturedGame {
  gameId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  timeControl: TimeControl;
  rated: boolean;
  ply: number;
  /** Current position, shown still until the board is swiped into view. */
  fen?: string;
}

const IDLE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** How often to look again while no game is running. */
const POLL_MS = 20_000;
/** Pause on the final position before moving to the next game. */
const NEXT_GAME_MS = 6_000;

/** How many live games the Play tab offers to swipe through. */
const MAX_GAMES = 4;

async function fetchLiveGames(): Promise<FeaturedGame[]> {
  const res = await fetch(`${API_BASE}/api/live/games?limit=${MAX_GAMES}`);
  if (!res.ok) throw new Error(`live games ${res.status}`);
  return ((await res.json()) as { games: FeaturedGame[] }).games;
}

/**
 * Up to four live games from the server. Looks again while nobody is playing,
 * now and then to fill empty slots, and when `refresh()` is called (a game ended).
 */
function useLiveGames() {
  const [games, setGames] = useState<FeaturedGame[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      fetchLiveGames()
        .then((list) => {
          if (!alive) return;
          // Keep the same objects for games still running, so their boards don't restart.
          setGames((prev) => list.map((g) => prev.find((p) => p.gameId === g.gameId) ?? g));
          setState('ready');
          if (list.length < MAX_GAMES) timer = setTimeout(load, POLL_MS);
        })
        .catch(() => {
          if (!alive) return;
          setState('offline');
          timer = setTimeout(load, POLL_MS);
        });
    load();
    // Look again when the app comes back to the foreground.
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      if (timer) clearTimeout(timer);
      load();
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [tick]);

  return { games, state, refresh };
}

/**
 * The Play tab's live boards: up to four games in progress side by side in one
 * spot. Swipe left or right (or use the arrows and dots) to switch; only the game
 * in view is followed move by move, the others show their latest position.
 */
export function LiveBoard({ width }: { width: number }) {
  const { games, state, refresh } = useLiveGames();
  const c = useAppTheme().colors;
  const { tr } = useI18n();
  const wide = width >= 640;
  const boardSize = Math.floor(Math.min(wide ? 300 : width - 32, 380));
  const [index, setIndex] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const count = games.length;
  const active = Math.min(index, Math.max(0, count - 1));

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(count - 1, i));
      setIndex(next);
      scroller.current?.scrollTo({ x: next * width, animated: true });
    },
    [count, width],
  );
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== active && i >= 0 && i < count) setIndex(i);
  };

  if (count === 0) return <LiveBoardShell wide={wide} boardSize={boardSize} message={state === 'loading' ? 'finding' : 'empty'} />;

  return (
    <View style={{ gap: 12 }}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onMomentumScrollEnd={onScroll}
        style={{ width }}>
        {games.map((g, i) => (
          <View key={g.gameId} style={{ width }}>
            {i === active ? (
              // Keyed so each game starts from a clean spectator state.
              <LiveGame key={g.gameId} game={g} wide={wide} boardSize={boardSize} onDone={refresh} />
            ) : (
              <GameCard
                game={g}
                wide={wide}
                boardSize={boardSize}
                fen={g.fen ?? IDLE_FEN}
                white={g.white}
                black={g.black}
                ms={() => null}
                running={null}
                last={undefined}
                recent=""
                over={false}
              />
            )}
          </View>
        ))}
      </ScrollView>
      {count > 1 && (
        <View style={styles.pager}>
          {Platform.OS === 'web' && (
            <PagerArrow icon="chevron-back" label={tr('common.previous')} disabled={active === 0} onPress={() => go(active - 1)} />
          )}
          <View style={styles.dots}>
            {games.map((g, i) => (
              <Pressable
                key={g.gameId}
                accessibilityRole="button"
                accessibilityState={{ selected: i === active }}
                accessibilityLabel={tr('home.liveBoard.page', { n: i + 1, total: count })}
                hitSlop={8}
                onPress={() => go(i)}>
                <View style={[styles.pageDot, { backgroundColor: i === active ? c.text : c.borderStrong, width: i === active ? 18 : 7 }]} />
              </Pressable>
            ))}
          </View>
          {Platform.OS === 'web' && (
            <PagerArrow icon="chevron-forward" label={tr('common.next')} disabled={active === count - 1} onPress={() => go(active + 1)} />
          )}
        </View>
      )}
    </View>
  );
}

function PagerArrow({ icon, label, disabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; disabled: boolean; onPress: () => void }) {
  const c = useAppTheme().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, { borderColor: c.border, backgroundColor: pressed ? c.surfacePressed : c.surface, opacity: disabled ? 0.35 : 1 }]}>
      <Ionicons name={icon} size={16} color={c.text} />
    </Pressable>
  );
}

function LiveGame({ game, wide, boardSize, onDone }: { game: FeaturedGame; wide: boolean; boardSize: number; onDone: () => void }) {
  const s = useSpectate(game.gameId);
  const now = useTicker(s.status === 'live' && !!s.clock?.running);

  const over = s.status === 'finished';
  const failed = s.status === 'error';
  useEffect(() => {
    if (!over && !failed) return;
    const id = setTimeout(onDone, failed ? 0 : NEXT_GAME_MS);
    return () => clearTimeout(id);
  }, [over, failed, onDone]);

  const recent = s.history
    .map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san))
    .slice(-6)
    .join('  ');
  return (
    <GameCard
      game={game}
      wide={wide}
      boardSize={boardSize}
      fen={s.status === 'connecting' && game.fen ? game.fen : s.fen}
      white={s.white ?? game.white}
      black={s.black ?? game.black}
      ms={(col) => (s.clock ? clockRemaining(s.clock, col, s.clockOffset, now) : null)}
      running={s.clock?.running ?? null}
      last={s.history[s.history.length - 1]}
      recent={recent}
      over={over}
    />
  );
}

interface GameCardProps {
  game: FeaturedGame;
  wide: boolean;
  boardSize: number;
  fen: string;
  white: PlayerInfo;
  black: PlayerInfo;
  ms: (c: Color) => number | null;
  running: Color | null | undefined;
  last: PlayedMove | undefined;
  recent: string;
  over: boolean;
}

/** One live game's card: board with both players, then time control, moves and Watch. */
function GameCard({ game, wide, boardSize, fen, white, black, ms, running, last, recent, over }: GameCardProps) {
  const c = useAppTheme().colors;
  const { tr } = useI18n();
  const watch = () => router.push({ pathname: '/watch/[gameId]', params: { gameId: game.gameId } });

  const board = (
    <View style={{ gap: 6, width: boardSize }}>
      <PlayerLine player={black} ms={ms('b')} active={running === 'b'} />
      <View accessible accessibilityLabel={tr('home.liveBoard.a11y', { white: white.name, black: black.name })}>
        <Board fen={fen} orientation="w" size={boardSize} lastMove={last ? { from: last.from, to: last.to } : null} checkSquare={checkSquareOf(fen)} hideCoordinates />
      </View>
      <PlayerLine player={white} ms={ms('w')} active={running === 'w'} />
    </View>
  );

  const info = (
    <View style={[styles.info, wide ? { flex: 1 } : { alignSelf: 'stretch' }]}>
      <View style={styles.badges}>
        <LiveDot color={over ? c.textTertiary : c.live} />
        <Text variant="overline" tone="muted">
          {formatTimeControl(game.timeControl)} · {game.rated ? tr('home.liveBoard.rated') : tr('home.liveBoard.casual')}
        </Text>
      </View>
      {wide && (
        <Text variant="subheading" numberOfLines={2}>
          {tr('watch.title', { white: white.name, black: black.name })}
        </Text>
      )}
      <Text variant="mono" tone="muted" numberOfLines={2} style={{ minHeight: 20 }}>
        {over ? tr('home.liveBoard.over') : recent}
      </Text>
      <View style={wide ? styles.actionsWide : undefined}>
        <Button
          title={tr('home.liveBoard.watch')}
          variant="secondary"
          onPress={watch}
          disabled={over}
          rightIcon={<Ionicons name="eye-outline" size={16} color={c.text} />}
        />
      </View>
    </View>
  );

  return (
    <GlassView radius="xl" padding="lg" style={[styles.card, wide && styles.cardWide]}>
      {board}
      {info}
    </GlassView>
  );
}

/** Same frame as a live game, with the start position and a status line. */
function LiveBoardShell({ wide, boardSize, message }: { wide: boolean; boardSize: number; message: 'finding' | 'empty' }) {
  const c = useAppTheme().colors;
  const { tr } = useI18n();
  return (
    <GlassView radius="xl" padding="lg" style={[styles.card, wide && styles.cardWide]}>
      <View style={{ opacity: 0.45 }}>
        <Board fen={IDLE_FEN} orientation="w" size={wide ? boardSize : Math.min(boardSize, 220)} hideCoordinates />
      </View>
      <View style={[styles.info, wide ? { flex: 1 } : { alignSelf: 'stretch' }]}>
        <View style={styles.badges}>
          <LiveDot color={c.textTertiary} />
          <Text variant="overline" tone="muted">
            {tr('home.liveBoard.title')}
          </Text>
        </View>
        <Text tone="muted">{tr(message === 'finding' ? 'home.liveBoard.finding' : 'home.liveBoard.empty')}</Text>
      </View>
    </GlassView>
  );
}

function PlayerLine({ player, ms, active }: { player: PlayerInfo; ms: number | null; active: boolean }) {
  const c = useAppTheme().colors;
  return (
    <View style={styles.player}>
      <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
        {player.name}
      </Text>
      <Text variant="caption" tone="tertiary">
        {Math.round(player.rating)}
        {player.provisional ? '?' : ''}
      </Text>
      <View style={{ flex: 1 }} />
      {ms != null && (
        <View style={[styles.clock, { borderColor: active ? c.borderStrong : c.border, backgroundColor: active ? c.surfacePressed : 'transparent' }]}>
          <Text variant="clock" style={{ fontSize: 14, lineHeight: 18, color: active ? c.text : c.muted }}>
            {formatClock(ms)}
          </Text>
        </View>
      )}
    </View>
  );
}

function LiveDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 18 },
  cardWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  info: { gap: 12 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionsWide: { alignItems: 'flex-start', marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageDot: { height: 7, borderRadius: 4 },
  arrow: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  clock: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
