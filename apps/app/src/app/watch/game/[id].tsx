import Ionicons from '@expo/vector-icons/Ionicons';
import { Game, formatClock, formatScore, type Color, type EventGameDetail, type EventGamePlayer, type Square } from '@chessmate/core';
import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Board } from '@/components/Board';
import { EvalBar } from '@/components/EvalBar';
import { BoardMoveBadge } from '@/components/MoveBadge';
import { MOVE_CLASS } from '@/constants/analysis';
import { useTicker } from '@/components/PlayerBar';
import { MoveStrip } from '@/components/game/MoveStrip';
import { TitleBadge } from '@/features/titles/TitleBadge';
import { LiveDot, SHOWN_GRADES, clockNow } from '@/features/watch/components';
import { useT } from '@/i18n';
import { countryFlag } from '@/lib/leaderboardApi';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useWideBoard } from '@/lib/useWideBoard';
import { usePolled, watchApi } from '@/lib/watchApi';
import { Button, GlassView, Row, Screen, Skeleton, Stack, Text, useAppTheme } from '@/ui';

/** One broadcast game: follows the live position, or step through the moves. */
export default function BroadcastGameScreen() {
  const tr = useT();
  const t = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => watchApi.game(String(id)), [id]);
  const { data: g, error, refresh } = usePolled<EventGameDetail>(id ? load : null, { fastMs: 2_000, slowMs: 60_000, isLive: (d) => d.status === 'live' });
  const { wide, size: wantSize, panel } = useWideBoard({ panel: 360, reserve: 160, phoneReserve: 300 });
  // On phones, never wider than the screen minus the page padding.
  const { width } = useWindowDimensions();
  const size = wide ? wantSize : Math.min(wantSize, Math.floor((width - 2 * 20) / 8) * 8);
  const [orientation, setOrientation] = useState<Color>('w');
  // null = follow the latest move.
  const [ply, setPly] = useState<number | null>(null);

  const history = useMemo(() => {
    if (!g) return [];
    try {
      return Game.fromUciMoves(g.moves, g.initialFen).history();
    } catch {
      return [];
    }
  }, [g]);
  const shown = ply === null ? history.length : Math.min(ply, history.length);
  const fen = shown === 0 ? (g?.initialFen ?? '') : history[shown - 1]!.fenAfter;
  const last = shown > 0 ? { from: history[shown - 1]!.from, to: history[shown - 1]!.to } : null;
  const live = g?.status === 'live';
  const now = useTicker(live && ply === null);
  const go = (p: number) => setPly(p >= history.length ? null : Math.max(0, p));
  const goRef = useRef(go);
  goRef.current = go;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // Arrow keys on the web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goRef.current(shownRef.current - 1);
      else if (e.key === 'ArrowRight') goRef.current(shownRef.current + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!g) {
    return (
      <Screen scroll>
        <RouterStack.Screen options={{ title: tr('watch.game') }} />
        {error ? (
          <GlassView padding="lg" radius="lg" style={{ gap: t.space.md }}>
            <Text tone="muted">{tr('watch.loadFailed', { reason: error })}</Text>
            <Button title={tr('common.tryAgain')} variant="secondary" onPress={() => void refresh()} />
          </GlassView>
        ) : (
          <Skeleton height={size} radius="lg" />
        )}
      </Screen>
    );
  }

  const toMove: Color = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  // Clock of each side at the position shown: the live clocks when following, else from the move's comment.
  const clockAt = (c: Color): number | null => {
    if (ply === null) return clockNow(c === 'w' ? g.whiteClockMs : g.blackClockMs, g.clockAt, live && toMove === c, now);
    for (let i = shown - 1; i >= 0; i--) if (i % 2 === (c === 'w' ? 0 : 1) && g.clocks[i] != null) return g.clocks[i]!;
    return null;
  };
  const resultFor = (c: Color) => (g.result === '*' ? null : g.result === '1/2-1/2' ? '½' : (g.result === '1-0') === (c === 'w') ? '1' : '0');
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const bar = (c: Color) => <PlayerLine p={c === 'w' ? g.white : g.black} clock={clockAt(c)} running={live && ply === null && toMove === c} result={resultFor(c)} />;

  // Live engine analysis (shared by everyone watching), for the position shown.
  const score = g.analysis?.scores[shown] ?? null;
  const best = g.analysis?.best[shown] ?? null;
  const grade = shown > 0 ? (g.analysis?.grades[shown - 1] ?? null) : null;
  const arrows = best && g.result === '*' && shown === history.length ? [{ from: best.slice(0, 2) as Square, to: best.slice(2, 4) as Square, color: 'rgba(63,111,196,0.75)' }] : [];
  const boardSize = size - EVAL_W - 6;
  const board = (
    <View style={{ gap: t.space.sm, width: size }}>
      {bar(top)}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <EvalBar score={score} orientation={orientation} height={boardSize} width={EVAL_W} />
        <View style={{ width: boardSize, height: boardSize }}>
          <Board fen={fen} orientation={orientation} size={boardSize} lastMove={last} checkSquare={checkSquareOf(fen)} arrows={arrows} />
          {grade && SHOWN_GRADES.has(grade) && last ? <BoardMoveBadge square={last.to as Square} cls={grade} size={boardSize} orientation={orientation} /> : null}
        </View>
      </View>
      {bar(top === 'w' ? 'b' : 'w')}
      <Row gap="sm" justify="space-between">
        <Text variant="caption" tone="muted">
          {score ? tr('watch.analysis.eval', { score: formatScore(score) }) : tr('watch.analysis.pending')}
        </Text>
        {best ? (
          <Text variant="caption" tone="muted">
            {tr('watch.analysis.best', { move: sanOf(fen, best) })}
          </Text>
        ) : null}
      </Row>
    </View>
  );

  const side = (
    <Stack gap="md" style={wide ? { width: panel } : undefined}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/watch/events/${g.eventId}`)}>
        <GlassView padding="md" radius="lg" style={{ gap: 2 }}>
          <Row gap="xs">
            {live && <LiveDot />}
            <Text variant="overline" tone={live ? 'danger' : 'muted'}>
              {live ? tr('watch.status.live') : g.result === '*' ? tr('watch.notStarted') : g.result.replace('1/2', '½')}
            </Text>
          </Row>
          <Text variant="bodyStrong" numberOfLines={1}>
            {g.eventName}
          </Text>
          <Text variant="caption" tone="muted">
            {[g.roundName, tr('watch.board', { n: g.board })].filter(Boolean).join(' · ')}
          </Text>
        </GlassView>
      </Pressable>
      <MoveStrip
        sans={history.map((m, i) => {
          const gr = g.analysis?.grades[i];
          return gr && SHOWN_GRADES.has(gr) ? `${m.san}${MOVE_CLASS[gr].glyph ?? ''}` : m.san;
        })}
        shown={shown}
        onSelect={go}
        onLive={() => setPly(null)}
        empty={tr('watch.noMovesYet')}
      />
      <Row gap="sm" justify="center">
        <NavButton icon="play-skip-back" label={tr('watch.nav.first')} onPress={() => go(0)} disabled={shown === 0} />
        <NavButton icon="chevron-back" label={tr('watch.nav.prev')} onPress={() => go(shown - 1)} disabled={shown === 0} />
        <NavButton icon="chevron-forward" label={tr('watch.nav.next')} onPress={() => go(shown + 1)} disabled={shown >= history.length} />
        <NavButton icon="play-skip-forward" label={tr('watch.nav.last')} onPress={() => setPly(null)} disabled={ply === null} />
        <NavButton icon="swap-vertical" label={tr('watch.nav.flip')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
      </Row>
      {ply !== null && live && <Button title={tr('watch.backToLive')} variant="secondary" onPress={() => setPly(null)} />}
    </Stack>
  );

  return (
    <Screen scroll width="full">
      <RouterStack.Screen options={{ title: `${g.white.name} – ${g.black.name}` }} />
      {wide ? (
        <Row gap="xl" align="flex-start" justify="center">
          {board}
          {side}
        </Row>
      ) : (
        <Stack gap="lg" style={{ alignItems: 'center' }}>
          {board}
          <View style={{ alignSelf: 'stretch' }}>{side}</View>
        </Stack>
      )}
    </Screen>
  );
}

const EVAL_W = 14;

/** A UCI move in this position as SAN ("Nf3"), or the UCI text if it cannot be played. */
function sanOf(fen: string, uci: string): string {
  try {
    const g = new Game(fen);
    return g.move(uci)?.san ?? uci;
  } catch {
    return uci;
  }
}

function PlayerLine({ p, clock, running, result }: { p: EventGamePlayer; clock: number | null; running: boolean; result: string | null }) {
  const t = useAppTheme();
  return (
    <Row gap="sm" justify="space-between">
      <Row gap="xs" style={{ flex: 1, minWidth: 0 }}>
        {p.federation ? <Text>{countryFlag(p.federation)}</Text> : null}
        <TitleBadge title={p.title} size="sm" />
        <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {p.name}
        </Text>
        {p.rating ? (
          <Text variant="caption" tone="muted">
            {p.rating}
          </Text>
        ) : null}
      </Row>
      {result !== null ? (
        <Text variant="bodyStrong">{result}</Text>
      ) : clock !== null ? (
        <View style={[styles.clock, { backgroundColor: running ? t.colors.text : t.colors.surfaceSunken }]}>
          <Text variant="clock" style={{ color: running ? t.colors.textInverse : t.colors.text, fontSize: 18 }}>
            {formatClock(clock)}
          </Text>
        </View>
      ) : null}
    </Row>
  );
}

function NavButton({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useAppTheme().colors;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={6} style={[styles.nav, { backgroundColor: c.surfaceSunken, opacity: disabled ? 0.4 : 1 }]}>
      <Ionicons name={icon} size={20} color={c.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clock: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  nav: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
