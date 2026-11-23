import { Game, premoveDests, type PuzzleDto, type Square } from '@chessmate/core';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { gameEndFeedback, moveFeedback } from '@/lib/feedback';
import { haptic } from '@/lib/haptics';
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
  const interaction = usePuzzleInteraction(view);
  const side = colorLabel(view.solver);
  const tone = view.feedback === 'wrong' || view.feedback === 'failed' ? t.danger : view.feedback === 'solved' || view.feedback === 'correct' ? SUCCESS[t.scheme] : t.text;
  const over = view.feedback === 'solved' || view.feedback === 'failed';
  usePuzzleSounds(view.fen, view.lastMove, over);

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
        premove={view.premove}
        onSquarePress={interaction.onSquarePress}
        {...interaction.dragProps}
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

/**
 * Board input for a puzzle: normal moves on the solver's turn, and premoves
 * while the opponent's move is still playing out. Tapping elsewhere or
 * right-clicking cancels a queued premove.
 */
function usePuzzleInteraction(view: PuzzleView) {
  const normal = useBoardInteraction(view.fen, (c) => view.canMove && c === view.solver, view.play);
  const [picked, setSelected] = useState<Square | null>(null);
  const game = new Game(view.fen);
  // Leaving premove mode (the turn came back or the puzzle ended) drops a half-made premove.
  const selected = view.canPremove ? picked : null;

  if (!view.canPremove) {
    const cancel = () => {
      normal.clear();
      if (view.premove) view.setPremove(null);
    };
    return { ...normal, dragProps: { ...normal.dragProps, onCancel: cancel } };
  }

  const movable = (sq: Square) => game.raw.get(sq)?.color === view.solver;
  const destsFrom = (from: Square) => premoveDests(view.fen, view.solver, from);
  const targets = selected ? destsFrom(selected) : [];

  const onSquarePress = (sq: Square) => {
    if (selected && targets.includes(sq)) {
      view.setPremove({ from: selected, to: sq });
      setSelected(null);
      return;
    }
    if (view.premove) view.setPremove(null);
    if (movable(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onPieceDrop = (from: Square, to: Square) => {
    setSelected(null);
    if (!movable(from)) return;
    if (destsFrom(from).includes(to)) view.setPremove({ from, to });
    else haptic('illegal');
  };

  const cancel = () => {
    setSelected(null);
    if (view.premove) view.setPremove(null);
  };

  return { selected, targets, onSquarePress, clear: cancel, dragProps: { canDrag: movable, onPieceDrop, onCancel: cancel } };
}

/** Move cues for the solver's moves and the puzzle's replies, worked out from the position change. */
function usePuzzleSounds(fen: string, lastMove: { from: string; to: string } | null | undefined, over: boolean) {
  const prev = useRef(fen);
  const wasOver = useRef(over);
  useEffect(() => {
    const before = prev.current;
    prev.current = fen;
    if (before === fen || !lastMove) return;
    try {
      const after = new Game(fen).fen;
      for (const m of new Game(before).legalMoves(lastMove.from as Square)) {
        if (m.to !== lastMove.to) continue;
        const g = new Game(before);
        const played = g.move(`${m.from}${m.to}${m.promotion ?? ''}`);
        if (played && g.fen === after) return moveFeedback(played.san);
      }
    } catch {
      // A new puzzle loaded; nothing to play.
    }
  }, [fen, lastMove]);
  useEffect(() => {
    if (over && !wasOver.current) gameEndFeedback();
    wasOver.current = over;
  }, [over]);
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  statusText: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
