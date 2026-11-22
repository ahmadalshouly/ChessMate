import Ionicons from '@expo/vector-icons/Ionicons';
import type { PuzzleDto } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { PuzzleBoard } from '@/components/PuzzleBoard';
import { Screen } from '@/components/ui';
import { puzzleApi } from '@/lib/puzzleApi';
import { useWideBoard } from '@/lib/useWideBoard';
import { NO_SWIPE_BACK, useNoSwipeBack } from '@/lib/useNoSwipeBack';
import { usePuzzle, type PuzzleFinish } from '@/lib/usePuzzle';
import { translate, useT } from '@/i18n';
import { puzzleThemeLabel } from '@/i18n/chess';
import { Button, GlassView, Row, Stack as Column, Text, useAppTheme } from '@/ui';

/**
 * Puzzle trainer: rated puzzles near your puzzle rating, optionally filtered
 * by theme. Also opens the daily puzzle (`?daily=1`) or one puzzle (`?id=`).
 */
export default function PuzzleTrainer() {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  const params = useLocalSearchParams<{ theme?: string; id?: string; daily?: string }>();
  const theme = params.theme || undefined;
  const daily = params.daily === '1';
  const [puzzle, setPuzzle] = useState<PuzzleDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ solved: boolean; delta?: number; rating?: number } | null>(null);
  const seen = useRef<string[]>([]);
  // Leave with the back button only: dragging a piece must never swipe the puzzle away.
  useNoSwipeBack();
  // Big board on wide screens (panel beside it); phones keep room below for hints and results.
  const { wide, size } = useWideBoard({ panel: 380, reserve: 116, phoneReserve: 330, sidebar: true });

  const load = useCallback(async () => {
    setError(null);
    setResult(null);
    setPuzzle(null);
    try {
      const r = daily && seen.current.length === 0 ? await puzzleApi.daily() : params.id && seen.current.length === 0 ? await puzzleApi.byId(params.id) : await puzzleApi.next({ theme, skip: seen.current });
      seen.current.push(r.puzzle.id);
      setPuzzle(r.puzzle);
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('puzzles.train.loadFailed'));
    }
  }, [daily, params.id, theme]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFinish = useCallback((f: PuzzleFinish) => {
    setResult({ solved: f.solved });
    puzzleApi
      .attempt(f.puzzle.id, { moves: f.moves, hints: f.hints, timeMs: f.timeMs, rated: true })
      .then((r) => r.rating && setResult({ solved: r.solved, rating: r.rating.after, delta: r.rating.after - r.rating.before }))
      .catch(() => {
        // Offline: keep the local result; the rating just isn't updated.
      });
  }, []);

  const view = usePuzzle(puzzle, { onFinish });
  const title = daily && seen.current.length <= 1 ? tr('puzzles.daily') : theme ? puzzleThemeLabel(theme) : tr('nav.puzzles');

  return (
    <Screen>
      <Stack.Screen options={{ title, ...NO_SWIPE_BACK }} />
      {error ? (
        <ScrollView contentContainerStyle={styles.page}>
          <GlassView padding="xl" radius="xl" style={{ width: Math.min(size, 560), gap: t.space.md }}>
            <Ionicons name="cloud-offline-outline" size={26} color={c.text} />
            <Column gap="xs">
              <Text variant="heading">{tr('puzzles.train.couldNotLoad')}</Text>
              <Text tone="muted">{error}</Text>
            </Column>
            <Button title={tr('common.tryAgain')} fullWidth onPress={load} />
          </GlassView>
        </ScrollView>
      ) : (
        <PuzzleBoard
          view={view}
          puzzle={puzzle}
          size={size}
          wide={wide}
          below={
            result && (
              <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
                <Row gap="md">
                  <Column gap="xxs" style={{ flex: 1 }}>
                    <Text variant="heading">{result.solved ? tr('puzzles.train.nice') : tr('puzzles.train.keepAtIt')}</Text>
                    {result.rating !== undefined && (
                      <Text variant="caption" tone="muted">
                        {tr('puzzles.home.rating')}
                      </Text>
                    )}
                  </Column>
                  {result.delta !== undefined && (
                    <Column gap="none" style={{ alignItems: 'flex-end' }}>
                      <Text variant="figure">{result.rating}</Text>
                      <Text variant="numeric" tone={result.delta > 0 ? 'success' : result.delta < 0 ? 'danger' : 'muted'}>
                        {`${result.delta >= 0 ? '+' : ''}${result.delta}`}
                      </Text>
                    </Column>
                  )}
                </Row>
                <Button title={tr('puzzles.train.next')} size="lg" fullWidth leftIcon={<Ionicons name="arrow-forward" size={16} color={c.onAccent} />} onPress={load} />
                {daily && <Button variant="secondary" fullWidth title={tr('puzzles.train.back')} onPress={() => router.back()} />}
              </GlassView>
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
});
