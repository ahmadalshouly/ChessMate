import { formatClock, formatTimeControl, type Color, type PlayerInfo, type TimeControl } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

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
}

const IDLE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** How often to look again while no game is running. */
const POLL_MS = 20_000;
/** Pause on the final position before moving to the next game. */
const NEXT_GAME_MS = 6_000;

async function fetchFeatured(): Promise<FeaturedGame | null> {
  const res = await fetch(`${API_BASE}/api/live/featured`);
  if (!res.ok) throw new Error(`featured ${res.status}`);
  return ((await res.json()) as { game: FeaturedGame | null }).game;
}

/**
 * Picks the server's featured live game, keeps looking while nobody is playing,
 * and moves on when the game ends or can't be watched. `next()` asks again now.
 */
function useFeaturedGame() {
  const [game, setGame] = useState<FeaturedGame | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [tick, setTick] = useState(0);
  const next = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      fetchFeatured()
        .then((g) => {
          if (!alive) return;
          setGame((prev) => (prev?.gameId === g?.gameId ? prev : g));
          setState('ready');
          if (!g) timer = setTimeout(load, POLL_MS);
        })
        .catch(() => {
          if (!alive) return;
          setState('offline');
          timer = setTimeout(load, POLL_MS);
        });
    load();
    // Look again when the app comes back to the foreground.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (timer) clearTimeout(timer);
      load();
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [tick]);

  return { game, state, next };
}

/** The Play tab's live board: a random game in progress, updated move by move. */
export function LiveBoard({ width }: { width: number }) {
  const { game, state, next } = useFeaturedGame();
  const wide = width >= 640;
  const boardSize = Math.floor(Math.min(wide ? 300 : width - 32, 380));

  if (!game) return <LiveBoardShell wide={wide} boardSize={boardSize} message={state === 'loading' ? 'finding' : 'empty'} />;
  // Keyed so each game starts from a clean spectator state.
  return <LiveGame key={game.gameId} game={game} wide={wide} boardSize={boardSize} onDone={next} />;
}

function LiveGame({ game, wide, boardSize, onDone }: { game: FeaturedGame; wide: boolean; boardSize: number; onDone: () => void }) {
  const t = useAppTheme();
  const c = t.colors;
  const { tr } = useI18n();
  const s = useSpectate(game.gameId);
  useTicker(s.status === 'live' && !!s.clock?.running);

  const over = s.status === 'finished';
  const failed = s.status === 'error';
  useEffect(() => {
    if (!over && !failed) return;
    const id = setTimeout(onDone, failed ? 0 : NEXT_GAME_MS);
    return () => clearTimeout(id);
  }, [over, failed, onDone]);

  const white = s.white ?? game.white;
  const black = s.black ?? game.black;
  const ms = (col: Color) => (s.clock ? clockRemaining(s.clock, col, s.clockOffset) : null);
  const last = s.history[s.history.length - 1];
  const recent = s.history
    .map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san))
    .slice(-6)
    .join('  ');
  const watch = () => router.push({ pathname: '/watch/[gameId]', params: { gameId: game.gameId } });

  const board = (
    <View style={{ gap: 6, width: boardSize }}>
      <PlayerLine player={black} ms={ms('b')} active={s.clock?.running === 'b'} />
      <View accessible accessibilityLabel={tr('home.liveBoard.a11y', { white: white.name, black: black.name })}>
        <Board fen={s.fen} orientation="w" size={boardSize} lastMove={last ? { from: last.from, to: last.to } : null} checkSquare={checkSquareOf(s.fen)} hideCoordinates />
      </View>
      <PlayerLine player={white} ms={ms('w')} active={s.clock?.running === 'w'} />
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
  clock: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});
