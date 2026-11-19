import { RUSH_DURATION_MS, RUSH_LIVES, type PuzzleDto, type PuzzleRunMode } from '@chessmate/core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { PuzzleBoard } from '@/components/PuzzleBoard';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { puzzleApi } from '@/lib/puzzleApi';
import { useBoardSize } from '@/lib/useBoardSize';
import { usePuzzle, type PuzzleFinish } from '@/lib/usePuzzle';
import { translate, useT, type TKey } from '@/i18n';

const COPY: Record<PuzzleRunMode, { title: TKey; rules: TKey }> = {
  streak: { title: 'puzzles.run.streakTitle', rules: 'puzzles.run.streakRules' },
  rush: { title: 'puzzles.run.rushTitle', rules: 'puzzles.run.rushRules' },
};
const RULE_PARAMS = { minutes: RUSH_DURATION_MS / 60_000, lives: RUSH_LIVES };

type Phase = 'ready' | 'playing' | 'over';

/** Streak and rush: a climbing ladder of puzzles, unrated, best score kept. */
export default function PuzzleRun() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: PuzzleRunMode = params.mode === 'rush' ? 'rush' : 'streak';
  const t = useTheme();
  const tr = useT();
  const size = useBoardSize(360);
  const [phase, setPhase] = useState<Phase>('ready');
  const [queue, setQueue] = useState<PuzzleDto[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [best, setBest] = useState<{ best: number; newBest?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);
  const ended = useRef(false);
  const [exhausted, setExhausted] = useState(false);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxMisses = mode === 'rush' ? RUSH_LIVES : 1;

  const fetchMore = useCallback(
    async (offset: number) => {
      if (fetching.current) return;
      fetching.current = true;
      try {
        const r = await puzzleApi.run(mode, offset);
        setQueue((q) => {
          const fresh = r.puzzles.filter((p) => !q.some((x) => x.id === p.id));
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
    setBest(null);
    setExhausted(false);
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

  // Rush clock.
  useEffect(() => {
    if (phase !== 'playing' || deadline === null) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) end(score);
    }, 250);
    return () => clearInterval(id);
  }, [phase, deadline, score, end]);

  // Keep a few puzzles queued ahead.
  useEffect(() => {
    if (phase === 'playing' && queue.length > 0 && index >= queue.length - 5) void fetchMore(queue.length);
  }, [phase, index, queue.length, fetchMore]);

  // Ran out of puzzles (small database): finish with the score so far.
  useEffect(() => {
    if (phase === 'playing' && exhausted && index >= queue.length) end(score);
  }, [phase, exhausted, index, queue.length, score, end]);

  useEffect(() => () => void (advance.current && clearTimeout(advance.current)), []);

  const onFinish = useCallback(
    (f: PuzzleFinish) => {
      const nextScore = score + (f.solved ? 1 : 0);
      const nextMisses = misses + (f.solved ? 0 : 1);
      setScore(nextScore);
      setMisses(nextMisses);
      if (nextMisses >= maxMisses) {
        // Let the player see the right answer first.
        advance.current = setTimeout(() => end(nextScore), 900);
        return;
      }
      advance.current = setTimeout(() => setIndex((i) => i + 1), f.solved ? 350 : 900);
    },
    [score, misses, maxMisses, end],
  );

  const puzzle = phase === 'playing' ? (queue[index] ?? null) : null;
  const view = usePuzzle(puzzle, { failOnMistake: true, onFinish });
  const left = deadline ? Math.max(0, deadline - now) : 0;
  const clock = `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: tr(COPY[mode].title) }} />
      {phase === 'playing' ? (
        <PuzzleBoard
          view={view}
          puzzle={puzzle}
          size={size}
          showHints={false}
          above={
            <>
              <View style={styles.hud}>
                <Text style={[styles.score, { color: t.text }]}>{score}</Text>
                <View style={styles.lives}>
                  {Array.from({ length: maxMisses }, (_, i) => (
                    <View key={i} style={[styles.life, { borderColor: t.text, backgroundColor: i < maxMisses - misses ? t.text : 'transparent' }]} />
                  ))}
                </View>
                {deadline !== null && <Text style={[styles.clock, { color: left < 20_000 ? t.danger : t.text }]}>{clock}</Text>}
              </View>
              {error && <Label muted>{error}</Label>}
            </>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={{ width: size, gap: 12 }}>
            {phase === 'ready' && (
              <Card>
                <Label size={22} bold>
                  {tr(COPY[mode].title)}
                </Label>
                <Label muted>{tr(COPY[mode].rules, RULE_PARAMS)}</Label>
                {error && <Label muted>{error}</Label>}
                <Button title={tr('puzzles.run.start')} onPress={start} />
              </Card>
            )}

            {phase === 'over' && (
              <Card>
                <Label muted>{mode === 'rush' ? (left === 0 ? tr('puzzles.run.timeUp') : tr('puzzles.run.outOfLives')) : tr('puzzles.run.streakOver')}</Label>
                <Text style={[styles.final, { color: t.text }]}>{score}</Text>
                <Label muted>{best ? (best.newBest ? tr('puzzles.run.newBest') : tr('puzzles.run.best', { n: best.best })) : tr('common.saving')}</Label>
                <Button title={tr('puzzles.run.again')} onPress={start} />
              </Card>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  score: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  lives: { flexDirection: 'row', gap: 6 },
  life: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  clock: { marginStart: 'auto', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  final: { fontSize: 56, fontWeight: '800' },
});
