import { Game, START_FEN, evalBarFraction, parseUci, type MoveClass, type ReviewedMove, type Square } from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { EvalBar } from '@/components/EvalBar';
import { BoardMoveBadge, MoveBadge } from '@/components/MoveBadge';
import { Button, Card, Label, Screen } from '@/components/ui';
import { BEST_MOVE_ARROW, MOVE_CLASS, REVIEW_ORDER, formatEval } from '@/constants/analysis';
import { useTheme } from '@/constants/theme';
import { dirIcon, useT } from '@/i18n';
import { ActionBar } from '@/components/game/ActionBar';
import { moveFeedbackText } from '@/i18n/chess';
import { serverText } from '@/i18n/serverMessages';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { useEngine } from '@/lib/useEngine';

const EVAL_BAR = 20;
/** Classes where the played move needs no "better move" arrow. */
const NO_ARROW = new Set<MoveClass>(['masterpiece', 'brilliant', 'great', 'best', 'forced', 'book']);
/** Summary rows shown even when nobody played that kind of move. */
const ALWAYS_LISTED = new Set<MoveClass>(['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']);
/** Moves marked on the evaluation graph. */
const GRAPH_MARKED = new Set<MoveClass>(['masterpiece', 'brilliant', 'great', 'mistake', 'miss', 'blunder']);

/**
 * Game review: Stockfish grades every move of a finished game (best to
 * blunder), with accuracy per side and the better move shown on the board.
 * The per-move results are what the AI coach explains.
 */
export default function Review() {
  const tr = useT();
  const params = useLocalSearchParams<{ gameId?: string; moves?: string; initialFen?: string; orientation?: string; white?: string; black?: string }>();
  const engine = useEngine();
  const t = useTheme();
  const { wide, size: boardSpace, panel: panelWidth } = useWideBoard({ panel: 420, reserve: 190 });
  const size = boardSpace - EVAL_BAR - 6;
  // The review beside the board scrolls within the window height (web).
  const [fillH, onFill] = useFillHeight();
  const [ply, setPly] = useState(0);
  // Play: steps through the game a move at a time, pieces sliding as if it were being played.
  const [autoplay, setAutoplay] = useState(false);
  const [flip, setFlip] = useState(params.orientation === 'b');
  const request = useMemo(
    () => ({
      moves: (params.moves ?? '').split(',').filter(Boolean),
      initialFen: params.initialFen || START_FEN,
      gameId: params.gameId || undefined,
    }),
    [params.moves, params.initialFen, params.gameId],
  );

  const { review: startReview } = engine;
  useEffect(() => {
    if (request.moves.length || request.gameId) startReview(request);
  }, [request, startReview]);

  const review = engine.state.review;
  const moves = review?.moves ?? [];

  // While the engine works, the board plays the game through move by move,
  // so there is something to watch instead of a bare progress bar.
  const preview = useMemo(() => {
    try {
      return Game.fromUciMoves(request.moves, request.initialFen).history();
    } catch {
      return [];
    }
  }, [request]);
  const [previewPly, setPreviewPly] = useState(0);
  const reviewing = !review && !engine.state.error && preview.length > 0;
  useEffect(() => {
    if (!reviewing || previewPly >= preview.length) return;
    const id = setTimeout(() => setPreviewPly((p) => p + 1), 450);
    return () => clearTimeout(id);
  }, [reviewing, previewPly, preview.length]);
  // Results in: carry on from where the preview got to, now with grades, unless it already finished.
  const [handedOver, setHandedOver] = useState<typeof review>(null);
  if (review && review !== handedOver) {
    setHandedOver(review);
    if (previewPly > 0 && previewPly < review.moves.length) {
      setPly(previewPly);
      setAutoplay(true);
    }
  }
  const previewMove = reviewing && previewPly > 0 ? preview[previewPly - 1] : undefined;

  const current: ReviewedMove | undefined = moves[ply - 1];
  const fen = previewMove ? previewMove.fenAfter : current ? current.fenAfter : (review?.initialFen ?? request.initialFen);
  const score = current ? current.scoreAfter : moves[0]?.scoreBefore ?? null;
  const orientation = flip ? 'b' : 'w';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setPly((p) => Math.min(moves.length, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moves.length]);

  useEffect(() => {
    if (!autoplay) return;
    if (ply >= moves.length) {
      setAutoplay(false);
      return;
    }
    const id = setTimeout(() => setPly((p) => p + 1), 900);
    return () => clearTimeout(id);
  }, [autoplay, ply, moves.length]);

  // Show what the engine preferred when the played move was not the best.
  const arrows: Arrow[] = [];
  if (current && current.bestMove !== current.uci && !NO_ARROW.has(current.judgement.classification)) {
    const m = parseUci(current.bestMove);
    arrows.push({ from: m.from, to: m.to, color: BEST_MOVE_ARROW });
  }

  if (!request.moves.length && !request.gameId) {
    return (
      <Screen>
        <View style={styles.page}>
          <Card>
            <Label>{tr('review.nothing')}</Label>
            <Button title={tr('home.analysis.cta')} onPress={() => router.replace('/analysis')} />
          </Card>
        </View>
      </Screen>
    );
  }

  const progress = engine.state.reviewProgress;
  const step = (fn: (p: number) => number) => {
    setAutoplay(false);
    setPly(fn);
  };
  const boardRow = (
          <View style={styles.boardRow}>
            <EvalBar score={review ? score : null} orientation={orientation} height={size} width={EVAL_BAR} />
            <View style={{ width: size, height: size }}>
              <Board
                fen={fen}
                orientation={orientation}
                size={size}
                lastMove={
                  previewMove
                    ? { from: previewMove.from, to: previewMove.to }
                    : current
                      ? { from: current.uci.slice(0, 2) as Square, to: current.uci.slice(2, 4) as Square }
                      : null
                }
                checkSquare={checkSquareOf(fen)}
              />
              <BoardArrows arrows={arrows} size={size} orientation={orientation} />
              {current && <BoardMoveBadge square={current.uci.slice(2, 4) as Square} cls={current.judgement.classification} size={size} orientation={orientation} />}
            </View>
          </View>
  );
  const bar = review ? (
              <ActionBar
                actions={[
                  { key: 'first', icon: dirIcon('page-first'), label: tr('review.first'), onPress: () => step(() => 0), disabled: ply === 0 },
                  { key: 'prev', icon: dirIcon('chevron-left'), label: tr('review.prev'), onPress: () => step((p) => Math.max(0, p - 1)), disabled: ply === 0, repeat: true },
                  {
                    key: 'play',
                    icon: autoplay ? 'pause' : 'play',
                    label: autoplay ? tr('review.pause') : tr('review.play'),
                    active: autoplay,
                    disabled: moves.length === 0,
                    onPress: () => {
                      if (!autoplay && ply >= moves.length) setPly(0);
                      setAutoplay((a) => !a);
                    },
                  },
                  { key: 'next', icon: dirIcon('chevron-right'), label: tr('review.next'), onPress: () => step((p) => Math.min(moves.length, p + 1)), disabled: ply >= moves.length, repeat: true },
                  { key: 'last', icon: dirIcon('page-last'), label: tr('review.last'), onPress: () => step(() => moves.length), disabled: ply >= moves.length },
                  { key: 'flip', icon: 'swap-vertical', label: tr('review.flip'), onPress: () => setFlip((f) => !f) },
                ]}
              />
  ) : null;
  const panel = (
    <>
          {!review && (
            <Card>
              {engine.state.error ? (
                <>
                  <Label bold>{tr('review.unavailable')}</Label>
                  <Label muted>
                    {engine.state.error.code === 'engine_locked'
                      ? tr('review.locked')
                      : serverText(engine.state.error.message)}
                  </Label>
                  <Button variant="secondary" title={tr('common.tryAgain')} onPress={() => startReview(request)} />
                </>
              ) : (
                <>
                  <Label bold>{tr('review.reviewing')}</Label>
                  <View style={[styles.track, { backgroundColor: t.border }]}>
                    <View style={[styles.fill, { backgroundColor: t.accent, width: `${progress ? (100 * progress.done) / Math.max(1, progress.total) : 0}%` }]} />
                  </View>
                  <Label muted>{progress ? tr('review.progress', { done: progress.done, total: progress.total }) : engine.state.connected ? tr('review.waitingEngine') : tr('play.connecting')}</Label>
                </>
              )}
            </Card>
          )}
          {review && (
            <>
              <Card>
                {current ? (
                  <>
                    <View style={styles.row}>
                      <MoveBadge cls={current.judgement.classification} size={64} variant="full" />
                      <Label bold size={17}>
                        {tr('review.moveIs', { move: `${moveNumber(current)} ${current.san}`, cls: MOVE_CLASS[current.judgement.classification].phrase })}
                      </Label>
                      <View style={{ marginStart: 'auto' }}>
                        <Label muted>{formatEval(current.scoreAfter)}</Label>
                      </View>
                    </View>
                    <Label>{moveFeedbackText(current)}</Label>
                    {current.bestMove !== current.uci && (
                      <Label muted>
                        {tr('review.engineLine', { line: current.bestLine.slice(0, 6).join(' '), eval: formatEval(current.scoreBefore) })}
                      </Label>
                    )}
                  </>
                ) : (
                  <Label muted>{tr('review.stepThrough')}</Label>
                )}
              </Card>

              <Card>
                <EvalGraph moves={moves} ply={ply} onSelect={setPly} />
              </Card>

              <Card>
                <View style={styles.sides}>
                  <SideName color="w" name={params.white || tr('review.white')} />
                  <SideName color="b" name={params.black || tr('review.black')} end />
                </View>
                <View style={styles.statRow}>
                  <Text style={[styles.accuracy, { color: t.text }]}>{review.accuracy.w}</Text>
                  <View style={styles.statMid}>
                    <Label muted size={13}>
                      {tr('review.accuracy')}
                    </Label>
                  </View>
                  <Text style={[styles.accuracy, styles.end, { color: t.text }]}>{review.accuracy.b}</Text>
                </View>
                <View style={[styles.accTrack, { backgroundColor: t.border }]}>
                  <View style={[styles.accHalf, { alignItems: 'flex-end' }]}>
                    <View style={{ width: `${review.accuracy.w}%`, height: '100%', backgroundColor: t.text, borderRadius: 3 }} />
                  </View>
                  <View style={styles.accHalf}>
                    <View style={{ width: `${review.accuracy.b}%`, height: '100%', backgroundColor: t.muted, borderRadius: 3 }} />
                  </View>
                </View>
                <View style={{ gap: 2 }}>
                  {REVIEW_ORDER.filter((c) => ALWAYS_LISTED.has(c) || (review.counts.w[c] ?? 0) + (review.counts.b[c] ?? 0) > 0).map((c) => {
                    const w = review.counts.w[c] ?? 0;
                    const b = review.counts.b[c] ?? 0;
                    return (
                      <View key={c} style={styles.statRow} accessible accessibilityLabel={tr('review.countA11y', { label: MOVE_CLASS[c].label, w, b })}>
                        <Text style={[styles.count, { color: w ? MOVE_CLASS[c].color : t.textTertiary }]}>{w}</Text>
                        <View style={styles.statMid}>
                          <MoveBadge cls={c} size={30} />
                          <Text style={[styles.classLabel, { color: t.text }]} numberOfLines={1}>
                            {MOVE_CLASS[c].label}
                          </Text>
                        </View>
                        <Text style={[styles.count, styles.end, { color: b ? MOVE_CLASS[c].color : t.textTertiary }]}>{b}</Text>
                      </View>
                    );
                  })}
                </View>
                <Label muted size={12}>{tr('review.depth', { n: review.depth })}</Label>
              </Card>

              <Card>
                <Label bold>{tr('analysis.moves')}</Label>
                <View style={styles.moveList}>
                  {moves.map((m) => (
                    <Pressable
                      key={m.ply}
                      onPress={() => setPly(m.ply)}
                      style={[styles.moveChip, ply === m.ply && { backgroundColor: t.accent }]}
                      accessibilityLabel={`${m.san}, ${MOVE_CLASS[m.judgement.classification].label}`}>
                      <Text style={{ color: ply === m.ply ? t.onAccent : t.text }}>
                        {m.color === 'w' || m.ply === 1 ? <Text style={{ color: ply === m.ply ? t.onAccent : t.muted }}>{moveNumber(m)} </Text> : null}
                        {m.san}
                      </Text>
                      <MoveBadge cls={m.judgement.classification} size={16} />
                    </Pressable>
                  ))}
                </View>
                <Button
                  variant="secondary"
                  title={tr('review.explore')}
                  onPress={() =>
                    router.push({
                      pathname: '/analysis',
                      params: { moves: moves.map((m) => m.uci).join(','), initialFen: review.initialFen, ply: String(ply) },
                    })
                  }
                />
              </Card>
            </>
          )}
    </>
  );

  return (
    <Screen>
      {wide ? (
        // Web and tablets: a big board with the controls under it, the review beside it.
        <View style={styles.wide} onLayout={onFill}>
          <View style={{ width: size + EVAL_BAR + 6, gap: 12 }}>
            {boardRow}
            {bar}
          </View>
          <ScrollView style={{ width: panelWidth, flexGrow: 0, height: fillH ? fillH - 32 : undefined, alignSelf: 'stretch' }} contentContainerStyle={styles.widePanel}>
            {panel}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={{ width: size + EVAL_BAR + 6, gap: 12 }}>
            {boardRow}
            {bar}
            {panel}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function moveNumber(m: ReviewedMove) {
  const full = Number(m.fenBefore.split(' ')[5] ?? 1);
  return m.color === 'w' ? `${full}.` : `${full}…`;
}

/** A side's name with its colour dot, for the split stats header. */
function SideName({ color, name, end }: { color: 'w' | 'b'; name: string; end?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.side, end && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.sideDot, { backgroundColor: color === 'w' ? '#FFFFFF' : '#15171B', borderColor: t.borderStrong }]} />
      <Text style={[styles.sideName, { color: t.text, textAlign: end ? 'right' : 'left' }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/** Evaluation over the game: White's expected score per ply, tap to jump. */
function EvalGraph({ moves, ply, onSelect }: { moves: ReviewedMove[]; ply: number; onSelect: (ply: number) => void }) {
  const t = useTheme();
  const height = 72;
  return (
    <View style={[styles.graph, { height, direction: 'ltr' }]}>
      {moves.map((m) => {
        const white = evalBarFraction(m.scoreAfter);
        const cls = m.judgement.classification;
        const flagged = GRAPH_MARKED.has(cls);
        return (
          <Pressable key={m.ply} onPress={() => onSelect(m.ply)} style={[styles.graphCol, { backgroundColor: '#1B1B1F' }]}>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * white, backgroundColor: '#E9E9EC' }} />
            {flagged && <View style={[styles.graphMark, { backgroundColor: MOVE_CLASS[cls].color }]} />}
            {ply === m.ply && <View style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: t.text }]} />}
          </Pressable>
        );
      })}
      <View pointerEvents="none" style={[styles.midline, { top: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wide: { flex: 1, minHeight: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 24, padding: 16 },
  widePanel: { gap: 12, paddingBottom: 32 },
  page: { padding: 12, alignItems: 'center' },
  boardRow: { flexDirection: 'row', gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  sides: { flexDirection: 'row', gap: 12 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  sideDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  sideName: { flex: 1, fontSize: 15, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', minHeight: 38 },
  statMid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  end: { textAlign: 'right' },
  accuracy: { width: 72, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  accTrack: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  accHalf: { flex: 1 },
  count: { width: 56, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  classLabel: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  moveList: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  graph: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden' },
  graphCol: { flex: 1, height: '100%' },
  graphMark: { position: 'absolute', top: 2, left: '20%', right: '20%', height: 4, borderRadius: 2 },
  midline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(127,127,135,0.8)' },
});
