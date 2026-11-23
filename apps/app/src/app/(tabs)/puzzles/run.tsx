import Ionicons from '@expo/vector-icons/Ionicons';
import { RUSH_DURATION_MS, RUSH_LIVES, type PuzzleDto, type PuzzleRunMode } from '@chessmate/core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PuzzleBoard } from '@/components/PuzzleBoard';
import { Screen } from '@/components/ui';
import { puzzleApi } from '@/lib/puzzleApi';
import { useWideBoard } from '@/lib/useWideBoard';
import { NO_SWIPE_BACK, useNoSwipeBack } from '@/lib/useNoSwipeBack';
import { usePuzzle, type PuzzleFinish } from '@/lib/usePuzzle';
import { translate, useT, type TKey } from '@/i18n';
import { Button, GlassView, Row, Stack as Column, Text, useAppTheme } from '@/ui';

const COPY: Record<PuzzleRunMode, { title: TKey; rules: TKey; icon: 'flame' | 'flash' }> = {
  streak: { title: 'puzzles.run.streakTitle', rules: 'puzzles.run.streakRules', icon: 'flame' },
  rush: { title: 'puzzles.run.rushTitle', rules: 'puzzles.run.rushRules', icon: 'flash' },
};
const RULE_PARAMS = { minutes: RUSH_DURATION_MS / 60_000, lives: RUSH_LIVES };

type Phase = 'ready' | 'playing' | 'over';

/** Streak and rush: a climbing ladder of puzzles, unrated, best score kept. */
export default function PuzzleRun() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: PuzzleRunMode = params.mode === 'rush' ? 'rush' : 'streak';
  const t = useAppTheme();
  const tr = useT();
  // Big board on wide screens (panel beside it); phones keep room below for hints and results.
  const { wide, size } = useWideBoard({ panel: 380, reserve: 116, phoneReserve: 360, sidebar: true });
  const [phase, setPhase] = useState<Phase>('ready');
  const [queue, setQueue] = useState<PuzzleDto[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [best, setBest] = useState<{ best: number; newBest?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);
  const ended = useRef(false);
  const [exhausted, setExhausted] = useState(false);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read by the clock and the finish handler without making them change on every point.
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const maxMisses = mode === 'rush' ? RUSH_LIVES : 1;
  // Leave with the back button only: dragging a piece must never swipe the run away.
  useNoSwipeBack();

  const fetchMore = useCallback(
    async (offset: number) => {
      if (fetching.current) return;
      fetching.current = true;
      try {
        const r = await puzzleApi.run(mode, offset);
        setQueue((q) => {
          const have = new Set(q.map((x) => x.id));
          const fresh = r.puzzles.filter((p) => !have.has(p.id));
          if (fresh.length === 0) setExhausted(true);
          return [...q, ...fresh];
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : translate('puzzles.run.loadFailed'));
      } finally {
        fetching.current = false;
      }
    },
    [mode],
  );

  const start = async () => {
    setError(null);
    setQueue([]);
    setIndex(0);
    setScore(0);
    setMisses(0);
    scoreRef.current = 0;
    missesRef.current = 0;
    setBest(null);
    setExhausted(false);
    setTimeUp(false);
    ended.current = false;
    await fetchMore(0);
    setPhase('playing');
    setDeadline(mode === 'rush' ? Date.now() + RUSH_DURATION_MS : null);
  };

  const end = useCallback(
    (finalScore: number) => {
      if (ended.current) return;
      ended.current = true;
      setPhase('over');
      puzzleApi
        .saveRun(mode, finalScore)
        .then(setBest)
        .catch(() => setBest({ best: finalScore }));
    },
    [mode],
  );

  const onTimeUp = useCallback(() => {
    setTimeUp(true);
    end(scoreRef.current);
  }, [end]);

  // Keep a few puzzles queued ahead.
  useEffect(() => {
    if (phase === 'playing' && queue.length > 0 && index >= queue.length - 5) void fetchMore(queue.length);
  }, [phase, index, queue.length, fetchMore]);

  // Ran out of puzzles (small database): finish with the score so far.
  useEffect(() => {
    if (phase === 'playing' && exhausted && index >= queue.length) end(scoreRef.current);
  }, [phase, exhausted, index, queue.length, end]);

  useEffect(() => () => void (advance.current && clearTimeout(advance.current)), []);

  const onFinish = useCallback(
    (f: PuzzleFinish) => {
      const nextScore = scoreRef.current + (f.solved ? 1 : 0);
      const nextMisses = missesRef.current + (f.solved ? 0 : 1);
      scoreRef.current = nextScore;
      missesRef.current = nextMisses;
      setScore(nextScore);
      setMisses(nextMisses);
      if (nextMisses >= maxMisses) {
        // Let the player see the right answer first.
        advance.current = setTimeout(() => end(nextScore), 900);
        return;
      }
      advance.current = setTimeout(() => setIndex((i) => i + 1), f.solved ? 350 : 900);
    },
    [maxMisses, end],
  );

  const puzzle = phase === 'playing' ? (queue[index] ?? null) : null;
  const view = usePuzzle(puzzle, { failOnMistake: true, onFinish });
  const c = t.colors;

  return (
    <Screen>
      <Stack.Screen options={{ title: tr(COPY[mode].title), ...NO_SWIPE_BACK }} />
      {phase === 'playing' ? (
        <PuzzleBoard
          view={view}
          puzzle={puzzle}
          size={size}
          wide={wide}
          showHints={false}
          above={
            <>
              <GlassView padding="md" radius="lg" style={styles.hud}>
                <Row gap="sm" style={{ flex: 1 }}>
                  <Ionicons name={COPY[mode].icon} size={18} color={c.text} />
                  <Text variant="figure">{score}</Text>
                </Row>
                <Row gap="xs" accessibilityLabel={`${maxMisses - misses}/${maxMisses}`}>
                  {Array.from({ length: maxMisses }, (_, i) => (
                    <View key={i} style={[styles.life, { borderColor: c.text, backgroundColor: i < maxMisses - misses ? c.text : 'transparent' }]} />
                  ))}
                </Row>
                {deadline !== null && <RushClock deadline={deadline} running={phase === 'playing'} onTimeUp={onTimeUp} />}
              </GlassView>
              {error && (
                <Text variant="caption" tone="muted">
                  {error}
                </Text>
              )}
            </>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={{ width: Math.min(size, 560) }}>
            {phase === 'ready' && (
              <GlassView padding="xl" radius="xl" style={{ gap: t.space.lg }}>
                <View style={[styles.icon, { backgroundColor: c.surfaceSunken, borderColor: c.glassBorder }]}>
                  <Ionicons name={COPY[mode].icon} size={26} color={c.text} />
                </View>
                <Column gap="xs">
                  <Text variant="title">{tr(COPY[mode].title)}</Text>
                  <Text tone="muted">{tr(COPY[mode].rules, RULE_PARAMS)}</Text>
                </Column>
                {error && (
                  <Text variant="caption" tone="danger">
                    {error}
                  </Text>
                )}
                <Button title={tr('puzzles.run.start')} size="lg" fullWidth leftIcon={<Ionicons name="play" size={16} color={c.onAccent} />} onPress={start} />
              </GlassView>
            )}

            {phase === 'over' && (
              <GlassView padding="xl" radius="xl" style={{ gap: t.space.lg, alignItems: 'center' }}>
                <Text variant="overline" tone="muted">
                  {mode === 'rush' ? (timeUp ? tr('puzzles.run.timeUp') : tr('puzzles.run.outOfLives')) : tr('puzzles.run.streakOver')}
                </Text>
                <Text variant="figure" style={styles.final}>
                  {score}
                </Text>
                <Text tone={best?.newBest ? 'success' : 'muted'}>
                  {best ? (best.newBest ? tr('puzzles.run.newBest') : tr('puzzles.run.best', { n: best.best })) : tr('common.saving')}
                </Text>
                <Button title={tr('puzzles.run.again')} size="lg" fullWidth leftIcon={<Ionicons name="refresh" size={16} color={c.onAccent} />} onPress={start} />
              </GlassView>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

/**
 * The rush clock owns its own ticking state, so the 4-per-second updates re-render
 * only this label, not the board and the whole screen.
 */
const RushClock = memo(function RushClock({ deadline, running, onTimeUp }: { deadline: number; running: boolean; onTimeUp: () => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) onTimeUp();
    }, 250);
    return () => clearInterval(id);
  }, [deadline, running, onTimeUp]);
  const left = Math.max(0, deadline - now);
  const secs = Math.ceil(left / 1000);
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <Text variant="clock" tone={left < 20_000 ? 'danger' : 'default'} style={styles.clock}>
      {label}
    </Text>
  );
});

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  life: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  clock: { minWidth: 64, textAlign: 'right' },
  icon: { width: 56, height: 56, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  final: { fontSize: 72, lineHeight: 80 },
});
