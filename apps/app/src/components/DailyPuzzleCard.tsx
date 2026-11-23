import { Game, type PuzzleDto } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { useI18n } from '@/i18n';
import { puzzleThemeLabel } from '@/i18n/chess';
import { puzzleApi } from '@/lib/puzzleApi';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

/**
 * Home, under the live games: today's puzzle on a board in the same card style.
 * Shows the position after the opponent's first move, from the solver's side.
 * Hidden when the puzzle server can't be reached.
 */
export function DailyPuzzleCard({ width }: { width: number }) {
  const c = useAppTheme().colors;
  const { tr } = useI18n();
  const [daily, setDaily] = useState<{ puzzle: PuzzleDto; attempted: boolean } | null>(null);
  const wide = width >= 640;
  const boardSize = Math.floor(Math.min(wide ? 300 : width - 32, 380));

  // Reload on focus, so a solved puzzle shows as done when coming back.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      puzzleApi.daily().then(
        (d) => live && setDaily(d),
        () => undefined,
      );
      return () => {
        live = false;
      };
    }, []),
  );

  const view = useMemo(() => {
    if (!daily) return null;
    const { fen, moves } = daily.puzzle;
    try {
      const game = new Game(fen);
      const setup = moves[0] ? game.move(moves[0]) : null;
      return { fen: game.fen, last: setup ? { from: setup.from, to: setup.to } : null, solver: game.turn };
    } catch {
      return null;
    }
  }, [daily]);

  if (!daily || !view) return null;
  const open = () => router.push({ pathname: '/puzzles/train', params: { daily: '1' } });
  const theme = daily.puzzle.themes.find((th) => th !== 'short' && th !== 'long' && th !== 'oneMove') ?? daily.puzzle.themes[0];

  return (
    <GlassView radius="xl" padding="lg" style={[styles.card, wide && styles.cardWide]}>
      <View accessible accessibilityLabel={tr('puzzles.daily')} style={{ width: boardSize }}>
        <Board fen={view.fen} orientation={view.solver} size={boardSize} lastMove={view.last} checkSquare={checkSquareOf(view.fen)} hideCoordinates />
      </View>
      <View style={[styles.info, wide ? { flex: 1 } : { alignSelf: 'stretch' }]}>
        <Text variant="overline" tone="muted">
          {tr('puzzles.ratingLabel', { rating: daily.puzzle.rating })}
          {theme ? ` · ${puzzleThemeLabel(theme)}` : ''}
        </Text>
        <Text variant="subheading">{view.solver === 'w' ? tr('home.dailyPuzzle.whiteToMove') : tr('home.dailyPuzzle.blackToMove')}</Text>
        <Text tone="muted">{daily.attempted ? tr('puzzles.home.dailyDone') : tr('puzzles.home.dailyNew')}</Text>
        <View style={wide ? styles.actionsWide : undefined}>
          <Button
            title={daily.attempted ? tr('puzzles.home.replay') : tr('puzzles.home.solve')}
            variant={daily.attempted ? 'secondary' : 'primary'}
            onPress={open}
            rightIcon={<Ionicons name="extension-puzzle-outline" size={16} color={daily.attempted ? c.text : c.onAccent} />}
          />
        </View>
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, alignItems: 'center' },
  cardWide: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  info: { gap: 8 },
  actionsWide: { flexDirection: 'row', marginTop: 4 },
});
