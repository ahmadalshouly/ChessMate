import { themeLabel, type PuzzleDto } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PuzzleBoard } from '@/components/PuzzleBoard';
import { Button, Card, Label, Screen } from '@/components/ui';
import { puzzleApi } from '@/lib/puzzleApi';
import { useBoardSize } from '@/lib/useBoardSize';
import { usePuzzle, type PuzzleFinish } from '@/lib/usePuzzle';

/**
 * Puzzle trainer: rated puzzles near your puzzle rating, optionally filtered
 * by theme. Also opens the daily puzzle (`?daily=1`) or one puzzle (`?id=`).
 */
export default function PuzzleTrainer() {
  const params = useLocalSearchParams<{ theme?: string; id?: string; daily?: string }>();
  const theme = params.theme || undefined;
  const daily = params.daily === '1';
  const [puzzle, setPuzzle] = useState<PuzzleDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ solved: boolean; delta?: number; rating?: number } | null>(null);
  const seen = useRef<string[]>([]);
  const size = useBoardSize(330);

  const load = useCallback(async () => {
    setError(null);
    setResult(null);
    setPuzzle(null);
    try {
      const r = daily && seen.current.length === 0 ? await puzzleApi.daily() : params.id && seen.current.length === 0 ? await puzzleApi.byId(params.id) : await puzzleApi.next({ theme, skip: seen.current });
      seen.current.push(r.puzzle.id);
      setPuzzle(r.puzzle);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load a puzzle');
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
  const title = daily && seen.current.length <= 1 ? 'Daily puzzle' : theme ? themeLabel(theme) : 'Puzzles';

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.page}>
        {error ? (
          <Card style={{ width: size }}>
            <Label bold>Couldn&apos;t load a puzzle</Label>
            <Label muted>{error}</Label>
            <Button title="Try again" onPress={load} />
          </Card>
        ) : (
          <View style={{ width: size, gap: 12 }}>
            <PuzzleBoard view={view} puzzle={puzzle} size={size} />
            {result && (
              <Card>
                <Label size={18} bold>
                  {result.solved ? 'Nice work.' : 'Keep at it.'}
                </Label>
                {result.delta !== undefined && (
                  <Label muted>
                    Puzzle rating {result.rating} ({result.delta >= 0 ? '+' : ''}
                    {result.delta})
                  </Label>
                )}
                <Button title="Next puzzle" onPress={load} />
                {daily && <Button variant="secondary" title="Back to puzzles" onPress={() => router.back()} />}
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
});
