import type { PuzzleDto } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PuzzleBoard } from '@/components/PuzzleBoard';
import { Button, Card, Label, Screen } from '@/components/ui';
import { puzzleApi } from '@/lib/puzzleApi';
import { useWideBoard } from '@/lib/useWideBoard';
import { NO_SWIPE_BACK, useNoSwipeBack } from '@/lib/useNoSwipeBack';
import { usePuzzle, type PuzzleFinish } from '@/lib/usePuzzle';
import { translate, useT } from '@/i18n';
import { puzzleThemeLabel } from '@/i18n/chess';

/**
 * Puzzle trainer: rated puzzles near your puzzle rating, optionally filtered
 * by theme. Also opens the daily puzzle (`?daily=1`) or one puzzle (`?id=`).
 */
export default function PuzzleTrainer() {
  const tr = useT();
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
          <Card style={{ width: Math.min(size, 560) }}>
            <Label bold>{tr('puzzles.train.couldNotLoad')}</Label>
            <Label muted>{error}</Label>
            <Button title={tr('common.tryAgain')} onPress={load} />
          </Card>
        </ScrollView>
      ) : (
        <PuzzleBoard
          view={view}
          puzzle={puzzle}
          size={size}
          wide={wide}
          below={
            result && (
              <Card>
                <Label size={18} bold>
                  {result.solved ? tr('puzzles.train.nice') : tr('puzzles.train.keepAtIt')}
                </Label>
                {result.delta !== undefined && (
                  <Label muted>
                    {tr('puzzles.train.ratingChange', { rating: result.rating ?? '', delta: `${result.delta >= 0 ? '+' : ''}${result.delta}` })}
                  </Label>
                )}
                <Button title={tr('puzzles.train.next')} onPress={load} />
                {daily && <Button variant="secondary" title={tr('puzzles.train.back')} onPress={() => router.back()} />}
              </Card>
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
