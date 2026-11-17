import type { PuzzleDto } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import type { usePuzzle } from '@/lib/usePuzzle';
import { translate, useT } from '@/i18n';
import { colorLabel, puzzleHintText, puzzleThemeLabel } from '@/i18n/chess';

type PuzzleView = ReturnType<typeof usePuzzle>;

const FEEDBACK: Record<PuzzleView['feedback'], (side: string) => string> = {
  loading: () => translate('puzzles.feedback.loading'),
  yourMove: (side) => translate('puzzles.feedback.yourMove', { side }),
  correct: () => translate('puzzles.feedback.correct'),
  wrong: () => translate('puzzles.feedback.wrong'),
  solved: () => translate('puzzles.feedback.solved'),
  failed: () => translate('puzzles.feedback.failed'),
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
  const tr = useT();
  const interaction = useBoardInteraction(view.fen, (c) => view.canMove && c === view.solver, view.play);
  const side = colorLabel(view.solver);
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
        {view.hint && <Label muted>{tr('puzzles.hint', { text: puzzleHintText(view.hint, view.fen) })}</Label>}
        {puzzle && showRating && (
          <Label muted>
            {tr('puzzles.ratingLabel', { rating: puzzle.rating })}
            {over && puzzle.themes.length > 0 ? ` · ${puzzle.themes.slice(0, 4).map(puzzleThemeLabel).join(tr('chess.listSep'))}` : ''}
          </Label>
        )}
        {showHints && !over && (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button variant="secondary" title={view.hintsUsed >= 1 ? tr('puzzles.showMove') : tr('computer.hint')} disabled={!view.canMove || view.hintsUsed >= 2} onPress={view.askHint} />
            </View>
            <View style={styles.flex}>
              <Button variant="secondary" title={tr('puzzles.solution')} disabled={!view.canMove} onPress={view.reveal} />
            </View>
          </View>
        )}
        {showHints && !over && <Label muted>{tr('puzzles.hintsCount')}</Label>}
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
