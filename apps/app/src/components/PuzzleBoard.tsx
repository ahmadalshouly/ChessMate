import { themeLabel, type PuzzleDto } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import type { usePuzzle } from '@/lib/usePuzzle';

type PuzzleView = ReturnType<typeof usePuzzle>;

const FEEDBACK: Record<PuzzleView['feedback'], (side: string) => string> = {
  loading: () => 'Get ready...',
  yourMove: (side) => `Your move. Find the best move for ${side}.`,
  correct: () => 'Correct. Keep going.',
  wrong: () => "That's not it. Try again.",
  solved: () => 'Solved!',
  failed: () => 'Puzzle failed. Here is the solution.',
};

/** Success is a game signal, so it gets colour like check and danger do. */
const SUCCESS = { light: '#1F8A4C', dark: '#4CC27F' };

/** Board plus status line and hint controls for one puzzle. */
export function PuzzleBoard({
  view,
  puzzle,
  size,
  showHints = true,
  showRating = true,
}: {
  view: PuzzleView;
  puzzle: PuzzleDto | null;
  size: number;
  showHints?: boolean;
  showRating?: boolean;
}) {
  const t = useTheme();
  const interaction = useBoardInteraction(view.fen, (c) => view.canMove && c === view.solver, view.play);
  const side = view.solver === 'w' ? 'White' : 'Black';
  const tone = view.feedback === 'wrong' || view.feedback === 'failed' ? t.danger : view.feedback === 'solved' || view.feedback === 'correct' ? SUCCESS[t.scheme] : t.text;
  const over = view.feedback === 'solved' || view.feedback === 'failed';

  return (
    <View style={{ width: size, gap: 12 }}>
      <Board
        fen={view.fen}
        orientation={view.solver}
        size={size}
        selected={interaction.selected ?? view.hint?.from ?? null}
        targets={interaction.selected ? interaction.targets : view.hint?.to ? [view.hint.to] : []}
        lastMove={view.lastMove}
        checkSquare={checkSquareOf(view.fen)}
        onSquarePress={interaction.onSquarePress}
      />
      <Card>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: view.solver === 'w' ? '#FFFFFF' : '#15171B', borderColor: t.border }]} />
          <Text style={[styles.statusText, { color: tone }]}>{FEEDBACK[view.feedback](side)}</Text>
        </View>
        {view.hint && <Label muted>Hint: {view.hint.text}</Label>}
        {puzzle && showRating && (
          <Label muted>
            Puzzle {puzzle.rating}
            {over && puzzle.themes.length > 0 ? ` · ${puzzle.themes.slice(0, 4).map(themeLabel).join(', ')}` : ''}
          </Label>
        )}
        {showHints && !over && (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button variant="secondary" title={view.hintsUsed >= 1 ? 'Show move' : 'Hint'} disabled={!view.canMove || view.hintsUsed >= 2} onPress={view.askHint} />
            </View>
            <View style={styles.flex}>
              <Button variant="secondary" title="Solution" disabled={!view.canMove} onPress={view.reveal} />
            </View>
          </View>
        )}
        {showHints && !over && <Label muted>Hints and wrong moves count as a miss for your puzzle rating.</Label>}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  statusText: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
