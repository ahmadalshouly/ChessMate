import Ionicons from '@expo/vector-icons/Ionicons';
import { Game, premoveDests, type PuzzleDto, type Square } from '@chessmate/core';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { useFillHeight } from '@/lib/useWideBoard';
import { Badge, Button, GlassView, Row, Stack, Text, useAppTheme } from '@/ui';
import { gameEndFeedback, illegalMoveFeedback, moveFeedback } from '@/lib/feedback';
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

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icon for each state. Colour only for right and wrong, which are game signals. */
const STATE_ICON: Record<PuzzleView['feedback'], IconName> = {
  loading: 'hourglass-outline',
  yourMove: 'locate-outline',
  correct: 'checkmark',
  wrong: 'close',
  solved: 'checkmark-done',
  failed: 'close',
};

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
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const interaction = usePuzzleInteraction(view);
  const side = colorLabel(view.solver);
  const good = view.feedback === 'solved' || view.feedback === 'correct';
  const bad = view.feedback === 'wrong' || view.feedback === 'failed';
  const tone = bad ? c.danger : good ? c.success : c.text;
  const over = view.feedback === 'solved' || view.feedback === 'failed';
  usePuzzleSounds(view.fen, view.lastMove, over);
  const [fillH, onFill] = useFillHeight();
  // Stable props, so the memoised board only redraws when the position or marks change.
  const hintTo = view.hint?.to ?? null;
  const targets = useMemo(() => (interaction.selected ? interaction.targets : hintTo ? [hintTo] : NONE), [interaction.selected, interaction.targets, hintTo]);
  const checkSquare = checkSquareOf(view.fen);

  return (
    <View style={[styles.screen, wide && styles.screenWide]} onLayout={onFill}>
      <View style={[styles.fixed, { width: size }]}>
        {above}
        <Board
          fen={view.fen}
          orientation={view.solver}
          size={size}
          selected={interaction.selected ?? view.hint?.from ?? null}
          targets={targets}
          lastMove={view.lastMove}
          checkSquare={checkSquare}
          premove={view.premove}
          onSquarePress={interaction.onSquarePress}
          // Puzzle moves sound (with haptics) from usePuzzleSounds below.
          sound={false}
          {...interaction.dragProps}
        />
      </View>
      <ScrollView
        style={wide ? [styles.scrollWide, { height: fillH }] : styles.scroll}
        contentContainerStyle={wide ? styles.scrollContentWide : styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={{ width: wide ? PANEL_WIDE : size, gap: t.space.md }}>
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
            <Row gap="md" align="center">
              <View style={[styles.stateIcon, { borderColor: bad ? c.danger : good ? c.success : c.glassBorder, backgroundColor: bad ? c.dangerSoft : good ? c.successSoft : c.surfaceSunken }]}>
                <Ionicons name={STATE_ICON[view.feedback]} size={20} color={tone} />
              </View>
              <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
                <Row gap="xs">
                  <View style={[styles.dot, { backgroundColor: view.solver === 'w' ? '#FFFFFF' : '#15171B', borderColor: c.borderStrong }]} />
                  <Text variant="overline" tone="muted">
                    {side}
                  </Text>
                </Row>
                <Text variant="subheading" color={tone}>
                  {FEEDBACK[view.feedback](side)}
                </Text>
              </Stack>
              {puzzle && showRating ? <Badge label={tr('puzzles.ratingLabel', { rating: puzzle.rating })} tone="outline" /> : null}
            </Row>
            {view.hint && !over && (
              <Row gap="xs" style={[styles.hint, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
                <Ionicons name="bulb-outline" size={16} color={c.text} />
                <Text variant="label" style={{ flex: 1 }}>
                  {tr('puzzles.hint', { text: puzzleHintText(view.hint, view.fen) })}
                </Text>
              </Row>
            )}
            {puzzle && over && puzzle.themes.length > 0 && (
              <View style={styles.themes}>
                {puzzle.themes.slice(0, 4).map((th) => (
                  <Badge key={th} label={puzzleThemeLabel(th)} />
                ))}
              </View>
            )}
            {showHints && !over && (
              <>
                <Row gap="sm">
                  <View style={styles.flex}>
                    <Button
                      variant="secondary"
                      fullWidth
                      leftIcon={<Ionicons name="bulb-outline" size={16} color={c.text} />}
                      title={view.hintsUsed >= 1 ? tr('puzzles.showMove') : tr('computer.hint')}
                      disabled={!view.canMove || view.hintsUsed >= 2}
                      onPress={view.askHint}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Button
                      variant="secondary"
                      fullWidth
                      leftIcon={<Ionicons name="eye-outline" size={16} color={c.text} />}
                      title={tr('puzzles.solution')}
                      disabled={!view.canMove}
                      onPress={view.reveal}
                    />
                  </View>
                </Row>
                <Text variant="caption" tone="muted">
                  {tr('puzzles.hintsCount')}
                </Text>
              </>
            )}
          </GlassView>
          {below}
        </View>
      </ScrollView>
    </View>
  );
}

const NONE: Square[] = [];

/**
 * Board input for a puzzle: normal moves on the solver's turn, and premoves
 * while the opponent's move is still playing out. Tapping elsewhere or
 * right-clicking cancels a queued premove.
 */
function usePuzzleInteraction(view: PuzzleView) {
  const normal = useBoardInteraction(view.fen, (col) => view.canMove && col === view.solver, view.play);
  const [picked, setPicked] = useState<Square | null>(null);
  // Leaving premove mode (the turn came back or the puzzle ended) drops a half-made premove.
  const selected = view.canPremove ? picked : null;

  if (!view.canPremove) {
    if (!view.premove) return normal;
    const cancel = () => {
      normal.clear();
      view.setPremove(null);
    };
    return { ...normal, dragProps: { ...normal.dragProps, onCancel: cancel } };
  }

  const game = new Game(view.fen);
  const movable = (sq: Square) => game.raw.get(sq)?.color === view.solver;
  const destsFrom = (from: Square) => premoveDests(view.fen, view.solver, from);
  const targets = selected ? destsFrom(selected) : [];

  const onSquarePress = (sq: Square) => {
    if (selected && targets.includes(sq)) {
      view.setPremove({ from: selected, to: sq });
      setPicked(null);
      return;
    }
    if (selected && sq !== selected && !movable(sq)) illegalMoveFeedback();
    if (view.premove) view.setPremove(null);
    if (movable(sq)) setPicked(sq === selected ? null : sq);
    else setPicked(null);
  };

  const onPieceDrop = (from: Square, to: Square) => {
    setPicked(null);
    if (!movable(from)) return;
    if (destsFrom(from).includes(to)) view.setPremove({ from, to });
    else illegalMoveFeedback();
  };

  const cancel = () => {
    setPicked(null);
    if (view.premove) view.setPremove(null);
  };

  return { ...normal, selected, targets, onSquarePress, clear: cancel, dragProps: { ...normal.dragProps, canDrag: movable, onPieceDrop, onCancel: cancel } };
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
        if (played && g.fen === after) return moveFeedback(played.san, g.fen);
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
  screenWide: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 24, paddingHorizontal: 16, minHeight: 0 },
  scrollWide: { flexGrow: 0, width: 380, alignSelf: 'stretch' },
  scrollContentWide: { paddingTop: 12, paddingBottom: 32 },
  fixed: { gap: 12, paddingTop: 12 },
  scroll: { flex: 1, alignSelf: 'stretch' },
  scrollContent: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 12, paddingBottom: 32 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  hint: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flex: { flex: 1 },
});
