import { START_FEN, evalBarFraction, parseUci, type ReviewedMove, type Square } from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { EvalBar } from '@/components/EvalBar';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MoveBadge } from '@/components/MoveBadge';
import { BEST_MOVE_ARROW, MOVE_CLASS, REVIEW_ORDER, formatEval } from '@/constants/analysis';

import { useTheme } from '@/constants/theme';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { useEngine } from '@/lib/useEngine';

/** Classes that only get a summary row when they happened. */
const RARE = new Set(['masterpiece', 'brilliant', 'missed', 'book']);

const EVAL_BAR = 20;

/**
 * Game review: Stockfish grades every move of a finished game (best to
 * blunder), with accuracy per side and the better move shown on the board.
 * The per-move results are what the AI coach explains.
 */
export default function Review() {
  const params = useLocalSearchParams<{ gameId?: string; moves?: string; initialFen?: string; orientation?: string }>();
  const engine = useEngine();
  const t = useTheme();
  const size = useBoardSize(300) - EVAL_BAR - 6;
  const [ply, setPly] = useState(0);
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
  const current: ReviewedMove | undefined = moves[ply - 1];
  const fen = current ? current.fenAfter : (review?.initialFen ?? request.initialFen);
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

  // Show what the engine preferred when the played move was not the best.
  const arrows: Arrow[] = [];
  if (current && current.bestMove !== current.uci && !['best', 'forced', 'book'].includes(current.judgement.classification)) {
    const m = parseUci(current.bestMove);
    arrows.push({ from: m.from, to: m.to, color: BEST_MOVE_ARROW });
  }

  if (!request.moves.length && !request.gameId) {
    return (
      <Screen>
        <View style={styles.page}>
          <Card>
            <Label>Nothing to review yet. Finish a game or load one on the analysis board.</Label>
            <Button title="Open analysis board" onPress={() => router.replace('/analysis')} />
          </Card>
        </View>
      </Screen>
    );
  }

  const progress = engine.state.reviewProgress;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size + EVAL_BAR + 6, gap: 12 }}>
          <View style={styles.boardRow}>
            <EvalBar score={review ? score : null} orientation={orientation} height={size} width={EVAL_BAR} />
            <View style={{ width: size, height: size }}>
              <Board
                fen={fen}
                orientation={orientation}
                size={size}
                lastMove={current ? { from: current.uci.slice(0, 2) as Square, to: current.uci.slice(2, 4) as Square } : null}
                checkSquare={checkSquareOf(fen)}
              />
              <BoardArrows arrows={arrows} size={size} orientation={orientation} />
            </View>
          </View>

          {!review && (
            <Card>
              {engine.state.error ? (
                <>
                  <Label bold>Review unavailable</Label>
                  <Label muted>
                    {engine.state.error.code === 'engine_locked'
                      ? 'Engine review is off while you have a live game. Come back when it ends.'
                      : engine.state.error.message}
                  </Label>
                  <Button variant="secondary" title="Try again" onPress={() => startReview(request)} />
                </>
              ) : (
                <>
                  <Label bold>Reviewing your game…</Label>
                  <View style={[styles.track, { backgroundColor: t.border }]}>
                    <View style={[styles.fill, { backgroundColor: t.accent, width: `${progress ? (100 * progress.done) / Math.max(1, progress.total) : 0}%` }]} />
                  </View>
                  <Label muted>{progress ? `${progress.done} of ${progress.total} positions` : engine.state.connected ? 'Waiting for the engine' : 'Connecting…'}</Label>
                </>
              )}
            </Card>
          )}

          {review && (
            <>
              <View style={styles.row}>
                <NavButton label="⏮" onPress={() => setPly(0)} disabled={ply === 0} />
                <NavButton label="◀" onPress={() => setPly(ply - 1)} disabled={ply === 0} />
                <NavButton label="▶" onPress={() => setPly(ply + 1)} disabled={ply >= moves.length} />
                <NavButton label="⏭" onPress={() => setPly(moves.length)} disabled={ply >= moves.length} />
                <NavButton label="⇅" onPress={() => setFlip((f) => !f)} />
              </View>

              <Card>
                {current ? (
                  <>
                    <View style={styles.row}>
                      <Badge cls={current.judgement.classification} />
                      <Label bold size={17}>
                        {moveNumber(current)} {current.san} is {MOVE_CLASS[current.judgement.classification].phrase}
                      </Label>
                      <View style={{ marginLeft: 'auto' }}>
                        <Label muted>{formatEval(current.scoreAfter)}</Label>
                      </View>
                    </View>
                    <Label>{current.feedback}</Label>
                    {current.bestMove !== current.uci && (
                      <Label muted>
                        Engine line: {current.bestLine.slice(0, 6).join(' ')} ({formatEval(current.scoreBefore)})
                      </Label>
                    )}
                  </>
                ) : (
                  <Label muted>Step through the game to see how each move was graded.</Label>
                )}
              </Card>

              <Card>
                <EvalGraph moves={moves} ply={ply} onSelect={setPly} />
              </Card>

              <Card>
                <View style={styles.summaryHead}>
                  <View style={{ flex: 1 }} />
                  <View style={styles.summaryCell}>
                    <Label muted>White</Label>
                  </View>
                  <View style={styles.summaryCell}>
                    <Label muted>Black</Label>
                  </View>
                </View>
                <SummaryRow label="Accuracy" w={`${review.accuracy.w}`} b={`${review.accuracy.b}`} strong />
                {REVIEW_ORDER.filter((c) => !RARE.has(c) || review.counts.w[c] + review.counts.b[c] > 0).map((c) => (
                  <SummaryRow key={c} cls={c} label={MOVE_CLASS[c].label} w={String(review.counts.w[c])} b={String(review.counts.b[c])} />
                ))}
                <Label muted size={12}>Engine depth {review.depth}</Label>
              </Card>

              <Card>
                <Label bold>Moves</Label>
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
                      {m.judgement.classification !== 'good' && m.judgement.classification !== 'book' && m.judgement.classification !== 'forced' && <MoveBadge cls={m.judgement.classification} size={16} rim={false} />}
                    </Pressable>
                  ))}
                </View>
                <Button
                  variant="secondary"
                  title="Explore in analysis board"
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
        </View>
      </ScrollView>
    </Screen>
  );
}

function moveNumber(m: ReviewedMove) {
  const full = Number(m.fenBefore.split(' ')[5] ?? 1);
  return m.color === 'w' ? `${full}.` : `${full}…`;
}

function Badge({ cls }: { cls: ReviewedMove['judgement']['classification'] }) {
  return <MoveBadge cls={cls} size={34} />;
}

function SummaryRow({ label, w, b, cls, strong }: { label: string; w: string; b: string; cls?: ReviewedMove['judgement']['classification']; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {cls && <MoveBadge cls={cls} size={22} />}
        <Label bold={strong}>{label}</Label>
      </View>
      <View style={styles.summaryCell}>
        <Label bold={strong}>{w}</Label>
      </View>
      <View style={styles.summaryCell}>
        <Label bold={strong}>{b}</Label>
      </View>
    </View>
  );
}

/** Evaluation over the game: White's expected score per ply, tap to jump. */
function EvalGraph({ moves, ply, onSelect }: { moves: ReviewedMove[]; ply: number; onSelect: (ply: number) => void }) {
  const t = useTheme();
  const height = 72;
  return (
    <View style={[styles.graph, { height }]}>
      {moves.map((m) => {
        const white = evalBarFraction(m.scoreAfter);
        const cls = m.judgement.classification;
        const flagged = cls === 'mistake' || cls === 'blunder' || cls === 'missed' || cls === 'brilliant' || cls === 'masterpiece';
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

function NavButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Button variant="secondary" title={label} onPress={onPress} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  boardRow: { flexDirection: 'row', gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  summaryHead: { flexDirection: 'row', gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryCell: { width: 52, alignItems: 'flex-end' },
  moveList: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  moveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  graph: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden' },
  graphCol: { flex: 1, height: '100%' },
  graphMark: { position: 'absolute', top: 2, left: '20%', right: '20%', height: 4, borderRadius: 2 },
  midline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(127,127,135,0.8)' },
});
