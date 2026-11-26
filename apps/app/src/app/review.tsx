import {
  Game,
  START_FEN,
  asGameResult,
  evalBarFraction,
  gameReviewPath,
  linePgn,
  parseUci,
  positionKey,
  reviewPath,
  type GameReview,
  type MoveClass,
  type PositionAnalysis,
  type ReviewedMove,
  type Square,
} from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Board } from '@/components/Board';
import { BoardArrows, type Arrow } from '@/components/BoardArrows';
import { EvalBar } from '@/components/EvalBar';
import { BoardMoveBadge, MoveBadge } from '@/components/MoveBadge';
import { Button, Card, Label, Screen } from '@/components/ui';
import { BEST_MOVE_ARROW, MOVE_CLASS, REVIEW_ORDER, formatEval, moveClassTint } from '@/constants/analysis';
import { useTheme } from '@/constants/theme';
import { dirIcon, useT } from '@/i18n';
import { ActionBar } from '@/components/game/ActionBar';
import { moveFeedbackText } from '@/i18n/chess';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { GRADE_DEPTH, gradeLine, remember } from '@/features/analysis/grading';
import { moveFeedback } from '@/lib/feedback';
import { useFillHeight, useWideBoard } from '@/lib/useWideBoard';
import { useAuth } from '@/lib/auth';
import { REVIEW_PLANS, analyzeLocally, canReviewLocally, isDeepReview, serverGameId, useGameReview, type ReviewMode } from '@/features/engine';
import { useReviewSettings } from '@/features/engine/reviewSettings';
import { BoardScan, ReviewProgress } from '@/features/engine/ReviewProgress';
import { ShareGameButton, type GameShare } from '@/features/share/ShareGame';
import { vsTitle } from '@/features/share/gameShares';

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
 * For signed-in players only. The engine runs on the player's device, and
 * moves appear graded from the first one while the rest of the game is still
 * being searched; an online game's first review is saved, and opening it again
 * (from any account) shows that review instead of grading again.
 */
export default function Review() {
  const tr = useT();
  const params = useLocalSearchParams<{ gameId?: string; moves?: string; initialFen?: string; orientation?: string; white?: string; black?: string; result?: string }>();
  const signedIn = useAuth().status === 'signedIn';
  const t = useTheme();
  const { wide, size: boardSpace, panel: panelWidth } = useWideBoard({ panel: 420, reserve: 140 });
  const size = boardSpace - EVAL_BAR - 6;
  // The review beside the board scrolls within the window height (web).
  const [fillH, onFill] = useFillHeight();
  const [ply, setPly] = useState(0);
  // Your own line: moves played on the board from a position of the game, graded as you go.
  const [branch, setBranch] = useState<{ from: number; moves: string[]; cursor: number } | null>(null);
  // Play: steps through the game a move at a time, pieces sliding as if it were being played.
  const [autoplay, setAutoplay] = useState(false);
  const [flip, setFlip] = useState(params.orientation === 'b');
  // How deep to search: the setting, or Deep once asked for on this game.
  const defaultMode = useReviewSettings().mode;
  const [deepAsked, setDeepAsked] = useState(false);
  const mode: ReviewMode = deepAsked ? 'deep' : defaultMode;
  const request = useMemo(
    () => ({
      moves: (params.moves ?? '').split(',').filter(Boolean),
      initialFen: params.initialFen || START_FEN,
      gameId: params.gameId ? serverGameId(params.gameId) : undefined,
      mode,
    }),
    [params.moves, params.initialFen, params.gameId, mode],
  );

  const graded = useGameReview(request, signedIn);
  // While a Deep review is graded, the review it replaces stays on screen.
  const [shallow, setShallow] = useState<{ review: GameReview; saved: boolean } | null>(null);
  const keepShallow = !!shallow && !graded.final;
  const upgrading = keepShallow && !graded.error;
  // While grading, `review` holds the moves graded so far (from the first one on).
  const review = keepShallow ? shallow.review : graded.review;
  const final = keepShallow || graded.final;
  const moves = review?.moves ?? [];
  const deepRange = `${REVIEW_PLANS.deep.quick.depth}–${REVIEW_PLANS.deep.deep.depth}`;
  const canDeepen = final && !keepShallow && !!review && mode !== 'deep' && !isDeepReview(review) && canReviewLocally();

  // The reviewing card stays a moment after grading ends, to show it is done
  // (not for a review that opens finished, from this device or saved).
  const [sawGrading, setSawGrading] = useState(false);
  const [doneShown, setDoneShown] = useState(false);
  const askDeep = () => {
    if (!review) return;
    setShallow({ review, saved: graded.source === 'saved' });
    setSawGrading(false);
    setDoneShown(false);
    setDeepAsked(true);
  };
  if ((!final || upgrading) && !sawGrading && graded.progress && graded.progress.done < graded.progress.total) setSawGrading(true);
  const lingering = final && !upgrading && sawGrading && !doneShown;
  useEffect(() => {
    if (!lingering) return;
    const id = setTimeout(() => setDoneShown(true), 1600);
    return () => clearTimeout(id);
  }, [lingering]);
  const showProgress = !final || upgrading || lingering;

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
  const reviewing = !review && !graded.error && preview.length > 0;
  useEffect(() => {
    if (!reviewing || previewPly >= preview.length) return;
    const id = setTimeout(() => setPreviewPly((p) => p + 1), 450);
    return () => clearTimeout(id);
  }, [reviewing, previewPly, preview.length]);
  // First grades in: carry on from where the preview got to, now with grades.
  const [handedOver, setHandedOver] = useState(false);
  if (review && !handedOver) {
    setHandedOver(true);
    if (previewPly > 0 && previewPly < preview.length) {
      setPly(Math.min(previewPly, review.moves.length));
      setAutoplay(true);
    }
  }
  const previewMove = reviewing && previewPly > 0 ? preview[previewPly - 1] : undefined;

  const startFen = review?.initialFen ?? request.initialFen;
  const current: ReviewedMove | undefined = branch ? undefined : moves[ply - 1];
  const branchBase = branch ? (branch.from > 0 ? (moves[branch.from - 1]?.fenAfter ?? startFen) : startFen) : startFen;
  const branchHistory = useMemo(() => {
    if (!branch) return [];
    try {
      return Game.fromUciMoves(branch.moves, branchBase).history();
    } catch {
      return [];
    }
  }, [branch, branchBase]);
  const branchMove = branch && branch.cursor > 0 ? branchHistory[branch.cursor - 1] : undefined;
  const mainFen = previewMove ? previewMove.fenAfter : current ? current.fenAfter : startFen;
  const fen = branch ? (branchMove?.fenAfter ?? branchBase) : mainFen;
  const orientation = flip ? 'b' : 'w';

  // The device engine checks every position of your line (the one shown first, then the
  // ones before it), so each of your moves gets a grade like in the review.
  const [seen, setSeen] = useState<Map<string, PositionAnalysis>>(() => new Map());
  const branchFens = useMemo(() => [branchBase, ...branchHistory.map((m) => m.fenAfter)], [branchBase, branchHistory]);
  const needed = branch ? [branchFens[branch.cursor]!, ...branchFens.slice(0, branch.cursor).reverse()].find((f) => !seen.has(positionKey(f))) : undefined;
  useEffect(() => {
    if (!needed) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      // Ahead of anything still queued for the review.
      analyzeLocally(needed, { depth: GRADE_DEPTH + 2, signal: ctrl.signal }).then(
        (a) => setSeen((prev) => remember(prev, a)),
        () => {},
      );
    }, 120);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [needed]);
  const branchGrades = useMemo(() => (branch ? gradeLine(branchBase, branchHistory, seen, []) : []), [branch, branchBase, branchHistory, seen]);
  const branchGrade = branch && branch.cursor > 0 ? branchGrades[branch.cursor - 1] : undefined;
  const shownAnalysis = branch ? seen.get(positionKey(fen)) : undefined;
  const branchScore = shownAnalysis ? (shownAnalysis.lines[0]?.score ?? null) : null;
  const score = branch ? branchScore : current ? current.scoreAfter : (moves[0]?.scoreBefore ?? null);

  /** A move made on the board: follows the game when it is the game's move, otherwise starts or extends your line. */
  const playOnBoard = (uci: string) => {
    if (!review) return false;
    const g = new Game(fen);
    const played = g.move(uci);
    if (!played) return false;
    setAutoplay(false);
    moveFeedback(played.san, g.fen);
    if (!branch) {
      if (moves[ply]?.uci === played.uci) setPly(ply + 1);
      else setBranch({ from: ply, moves: [played.uci], cursor: 1 });
      return true;
    }
    if (branch.cursor === 0 && moves[branch.from]?.uci === played.uci) {
      // Back on the game's own move.
      setBranch(null);
      setPly(branch.from + 1);
      return true;
    }
    if (branch.moves[branch.cursor] === played.uci) setBranch({ ...branch, cursor: branch.cursor + 1 });
    else setBranch({ ...branch, moves: [...branch.moves.slice(0, branch.cursor), played.uci], cursor: branch.cursor + 1 });
    return true;
  };
  const interaction = useBoardInteraction(fen, () => !!review, playOnBoard);
  const leaveBranch = () => {
    if (branch) setPly(branch.from);
    setBranch(null);
  };
  const goMain = (p: number) => {
    setBranch(null);
    setAutoplay(false);
    setPly(p);
  };
  const back = () => {
    setAutoplay(false);
    if (!branch) return setPly((p) => Math.max(0, p - 1));
    if (branch.cursor > 0) return setBranch({ ...branch, cursor: branch.cursor - 1 });
    goMain(Math.max(0, branch.from - 1));
  };
  const forward = () => {
    setAutoplay(false);
    if (!branch) return setPly((p) => Math.min(moves.length, p + 1));
    if (branch.cursor < branch.moves.length) setBranch({ ...branch, cursor: branch.cursor + 1 });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') back();
      if (e.key === 'ArrowRight') forward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!autoplay) return;
    if (ply >= moves.length) {
      // Still grading: wait for the next move rather than stopping.
      if (final) setAutoplay(false);
      return;
    }
    const id = setTimeout(() => setPly((p) => p + 1), 900);
    return () => clearTimeout(id);
  }, [autoplay, ply, moves.length, final]);

  // Show what the engine preferred when the played move was not the best.
  const arrows: Arrow[] = [];
  if (current && current.bestMove !== current.uci && !NO_ARROW.has(current.judgement.classification)) {
    const m = parseUci(current.bestMove);
    arrows.push({ from: m.from, to: m.to, color: BEST_MOVE_ARROW });
  }
  // In your line: the better move, when yours was not among the best.
  const branchBest = branch && branch.cursor > 0 ? seen.get(positionKey(branchFens[branch.cursor - 1]!))?.lines[0]?.pv[0] : undefined;
  if (branchMove && branchGrade && branchBest && branchBest !== branchMove.uci && !NO_ARROW.has(branchGrade.classification)) {
    const m = parseUci(branchBest);
    arrows.push({ from: m.from, to: m.to, color: BEST_MOVE_ARROW });
  }

  if (!signedIn) {
    return (
      <Screen>
        <View style={styles.page}>
          <Card>
            <Label bold size={17}>
              {tr('review.signIn.title')}
            </Label>
            <Label muted>{tr('review.signIn.body')}</Label>
            <Button title={tr('review.signIn.button')} onPress={() => router.push('/sign-in')} />
          </Card>
        </View>
      </Screen>
    );
  }

  if (!request.moves.length) {
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

  const progress = graded.progress;
  const step = (fn: (p: number) => number) => {
    setAutoplay(false);
    setBranch(null);
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
                  branch
                    ? branchMove
                      ? { from: branchMove.from, to: branchMove.to }
                      : null
                    : previewMove
                      ? { from: previewMove.from, to: previewMove.to }
                      : current
                        ? { from: current.uci.slice(0, 2) as Square, to: current.uci.slice(2, 4) as Square }
                        : null
                }
                lastMoveColor={
                  branch
                    ? branchMove && branchGrade
                      ? moveClassTint(branchGrade.classification)
                      : null
                    : !previewMove && current
                      ? moveClassTint(current.judgement.classification)
                      : null
                }
                checkSquare={checkSquareOf(fen)}
                selected={review ? interaction.selected : null}
                targets={review ? interaction.targets : []}
                onSquarePress={review ? interaction.onSquarePress : undefined}
                {...(review ? interaction.dragProps : {})}
              />
              <BoardArrows arrows={arrows} size={size} orientation={orientation} />
              <BoardScan size={size} active={!final && !graded.error} />
              {current && <BoardMoveBadge square={current.uci.slice(2, 4) as Square} cls={current.judgement.classification} size={size} orientation={orientation} />}
              {branchMove && branchGrade && <BoardMoveBadge square={branchMove.to} cls={branchGrade.classification} size={size} orientation={orientation} />}
            </View>
          </View>
  );
  const bar = review ? (
              <ActionBar
                actions={[
                  { key: 'first', icon: dirIcon('page-first'), label: tr('review.first'), onPress: () => step(() => 0), disabled: !branch && ply === 0 },
                  { key: 'prev', icon: dirIcon('chevron-left'), label: tr('review.prev'), onPress: back, disabled: !branch && ply === 0, repeat: true },
                  {
                    key: 'play',
                    icon: autoplay ? 'pause' : 'play',
                    label: autoplay ? tr('review.pause') : tr('review.play'),
                    active: autoplay,
                    disabled: moves.length === 0,
                    onPress: () => {
                      if (branch) leaveBranch();
                      if (!autoplay && ply >= moves.length) setPly(0);
                      setAutoplay((a) => !a);
                    },
                  },
                  { key: 'next', icon: dirIcon('chevron-right'), label: tr('review.next'), onPress: forward, disabled: branch ? branch.cursor >= branch.moves.length : ply >= moves.length, repeat: true },
                  {
                    key: 'last',
                    icon: dirIcon('page-last'),
                    label: tr('review.last'),
                    onPress: () => (branch ? setBranch({ ...branch, cursor: branch.moves.length }) : step(() => moves.length)),
                    disabled: branch ? branch.cursor >= branch.moves.length : ply >= moves.length,
                  },
                  { key: 'flip', icon: 'swap-vertical', label: tr('review.flip'), onPress: () => setFlip((f) => !f) },
                ]}
              />
  ) : null;
  const panel = (
    <>
          {graded.error ? (
            <Card>
              <Label bold>{tr('review.unavailable')}</Label>
              <Label muted>
                {graded.error.code === 'engine_locked' ? tr('review.locked') : graded.error.code === 'no_engine' ? tr('review.noEngine') : tr('review.engineFailed')}
              </Label>
              {graded.error.code !== 'engine_locked' && <Button variant="secondary" title={tr('common.tryAgain')} onPress={graded.retry} />}
            </Card>
          ) : showProgress ? (
            <ReviewProgress
              done={progress?.done ?? 0}
              total={progress?.total ?? request.moves.length + 1}
              checking={graded.checking && !progress?.done}
              finished={final && !upgrading}
              tookMs={graded.tookMs}
              latest={upgrading ? graded.review?.moves[graded.review.moves.length - 1] : moves[moves.length - 1]}
              where={graded.where}
              title={mode === 'deep' ? `${tr('review.deep.title')} · ${deepRange}` : undefined}
            />
          ) : null}
          {review && branch && (
            <Card>
              <View style={styles.row}>
                <Label bold size={17}>
                  {tr('review.line.title')}
                </Label>
                <View style={{ marginStart: 'auto' }}>
                  <Label muted>{branchScore ? formatEval(branchScore) : ''}</Label>
                </View>
              </View>
              <Label muted size={13}>
                {tr('review.line.from', { move: branch.from > 0 ? `${moveNumber(moves[branch.from - 1]!)} ${moves[branch.from - 1]!.san}` : tr('review.line.start') })}
              </Label>
              {branchMove && branchGrade ? (
                <View style={styles.row}>
                  <MoveBadge cls={branchGrade.classification} size={52} variant="full" />
                  <Label bold>{tr('review.moveIs', { move: branchMove.san, cls: MOVE_CLASS[branchGrade.classification].phrase })}</Label>
                </View>
              ) : branchMove ? (
                <Label muted>{tr('review.line.checking')}</Label>
              ) : null}
              {branchMove && branchGrade && branchBest && branchBest !== branchMove.uci && !NO_ARROW.has(branchGrade.classification) ? (
                <Label muted>{tr('review.line.best', { move: sanIn(branchFens[branch.cursor - 1]!, branchBest) })}</Label>
              ) : null}
              <View style={styles.moveList}>
                {branchHistory.map((m, i) => {
                  const g = branchGrades[i];
                  const on = branch.cursor === i + 1;
                  const [, side, , , , full] = branchFens[i]!.split(' ');
                  return (
                    <Pressable
                      key={`${i}-${m.uci}`}
                      onPress={() => setBranch({ ...branch, cursor: i + 1 })}
                      style={[styles.moveChip, on && { backgroundColor: t.accent }]}
                      accessibilityLabel={g ? `${m.san}, ${MOVE_CLASS[g.classification].label}` : m.san}>
                      <Text style={{ color: on ? t.onAccent : t.text }}>
                        {side === 'w' || i === 0 ? <Text style={{ color: on ? t.onAccent : t.muted }}>{full}{side === 'w' ? '.' : '…'} </Text> : null}
                        {m.san}
                      </Text>
                      {g ? <MoveBadge cls={g.classification} size={16} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <Button variant="secondary" title={tr('review.line.back')} onPress={leaveBranch} />
            </Card>
          )}
          {review && (
            <>
              {!branch && (
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
                  <>
                    <Label muted>{tr('review.stepThrough')}</Label>
                    <Label muted size={13}>
                      {tr('review.line.hint')}
                    </Label>
                  </>
                )}
              </Card>
              )}

              <Card>
                <EvalGraph moves={moves} total={final ? moves.length : request.moves.length} ply={branch ? branch.from : ply} onSelect={goMain} />
              </Card>

              {final && (
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
                <Label muted size={12}>
                  {tr((keepShallow ? shallow.saved : graded.source === 'saved') ? 'review.depthSaved' : 'review.depthDevice', { n: review.maxDepth ? `${review.depth}–${review.maxDepth}` : review.depth })}
                </Label>
                {canDeepen && (
                  <>
                    <Button variant="secondary" title={tr('review.deep.button', { n: deepRange })} onPress={askDeep} />
                    <Label muted size={12}>
                      {tr('review.deep.hint')}
                    </Label>
                  </>
                )}
              </Card>
              )}

              <Card>
                <Label bold>{tr('analysis.moves')}</Label>
                <View style={styles.moveList}>
                  {moves.map((m) => (
                    <Pressable
                      key={m.ply}
                      onPress={() => goMain(m.ply)}
                      style={[styles.moveChip, !branch && ply === m.ply && { backgroundColor: t.accent }]}
                      accessibilityLabel={`${m.san}, ${MOVE_CLASS[m.judgement.classification].label}`}>
                      <Text style={{ color: !branch && ply === m.ply ? t.onAccent : t.text }}>
                        {m.color === 'w' || m.ply === 1 ? <Text style={{ color: !branch && ply === m.ply ? t.onAccent : t.muted }}>{moveNumber(m)} </Text> : null}
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

  // Online games link to the server's review; any other game carries its moves.
  const result = asGameResult(params.result) ?? '*';
  const share: GameShare = {
    title: params.white && params.black ? vsTitle(params.white, params.black) : tr('titles.review'),
    link: request.gameId
      ? gameReviewPath(request.gameId)
      : reviewPath({ moves: request.moves, initialFen: request.initialFen, white: params.white, black: params.black, result, orientation: params.orientation === 'b' ? 'b' : 'w' }),
    pgn: () => linePgn({ moves: request.moves, initialFen: request.initialFen, white: params.white, black: params.black, result, tags: request.gameId ? { Event: 'ChessMate online game' } : undefined }),
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <ShareGameButton share={share} /> }} />
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

/** A UCI move as SAN in a position ("Nf3"), or the UCI text if it cannot be played there. */
function sanIn(fen: string, uci: string): string {
  try {
    return new Game(fen).move(uci)?.san ?? uci;
  } catch {
    return uci;
  }
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
function EvalGraph({ moves, total, ply, onSelect }: { moves: ReviewedMove[]; total: number; ply: number; onSelect: (ply: number) => void }) {
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
      {/* Moves still being graded keep their place, so the graph fills in from the left. */}
      {Array.from({ length: Math.max(0, total - moves.length) }, (_, i) => (
        <View key={`pending-${i}`} style={[styles.graphCol, { backgroundColor: '#1B1B1F', opacity: 0.35 }]} />
      ))}
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
