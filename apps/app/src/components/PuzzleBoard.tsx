import { Game, type PuzzleDto, type Square } from '@chessmate/core';
import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { gameEndFeedback, moveFeedback } from '@/lib/feedback';
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

/** Width of the panel beside the board on wide screens. */
const PANEL_WIDE = 380;

/** Success is a game signal, so it gets colour like check and danger do. */
const SUCCESS = { light: '#1F8A4C', dark: '#4CC27F' };

/**
 * Board plus status line and hint controls for one puzzle. Fills the screen:
 * the board (and `above`, e.g. a score bar) stays in place while the status,
 * hints and `below` (e.g. the result) scroll underneath, so the board never
 * moves while solving.
 */
export function PuzzleBoard({
  view,
  puzzle,
  size,
  showHints = true,
  showRating = true,
  above,
  below,
  wide = false,
}: {
  view: PuzzleView;
  puzzle: PuzzleDto | null;
  size: number;
  showHints?: boolean;
  showRating?: boolean;
  above?: ReactNode;
  below?: ReactNode;
  /** Wide screens: the panel sits beside the board instead of under it. */
  wide?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const interaction = useBoardInteraction(view.fen, (c) => view.canMove && c === view.solver, view.play);
  const side = colorLabel(view.solver);
  const tone = view.feedback === 'wrong' || view.feedback === 'failed' ? t.danger : view.feedback === 'solved' || view.feedback === 'correct' ? SUCCESS[t.scheme] : t.text;
  const over = view.feedback === 'solved' || view.feedback === 'failed';
  usePuzzleSounds(view.fen, view.lastMove, over);

  return (
    <View style={[styles.screen, wide && styles.screenWide]}>
      <View style={[styles.fixed, { width: size }]}>
        {above}
        <Board
        fen={view.fen}
        orientation={view.solver}
        size={size}
        selected={interaction.selected ?? view.hint?.from ?? null}
        targets={interaction.selected ? interaction.targets : view.hint?.to ? [view.hint.to] : []}
        lastMove={view.lastMove}
        checkSquare={checkSquareOf(view.fen)}
        onSquarePress={interaction.onSquarePress}
        {...interaction.dragProps}
        />
      </View>
      <ScrollView
        style={wide ? styles.scrollWide : styles.scroll}
        contentContainerStyle={wide ? styles.scrollContentWide : styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={{ width: wide ? PANEL_WIDE : size, gap: 12 }}>
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
          {below}
        </View>
      </ScrollView>
    </View>
  );
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
  screen: { flex: 1, alignItems: 'center' },
  screenWide: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 24, paddingHorizontal: 16 },
  scrollWide: { flexGrow: 0, width: 380 },
  scrollContentWide: { paddingTop: 12, paddingBottom: 32 },
  fixed: { gap: 12, paddingTop: 12 },
  scroll: { flex: 1, alignSelf: 'stretch' },
  scrollContent: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 12, paddingBottom: 32 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  statusText: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
