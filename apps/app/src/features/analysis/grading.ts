import { classifyMove, positionKey, terminalScore, type MoveJudgement, type PositionAnalysis } from '@chessmate/core';

/** Engine depth from which a position's result is trusted for grading moves. */
export const GRADE_DEPTH = 12;

/** Stores a result unless a deeper (or equally deep but wider) one is already known. */
export function remember(prev: Map<string, PositionAnalysis>, a: PositionAnalysis): Map<string, PositionAnalysis> {
  const key = positionKey(a.fen);
  const old = prev.get(key);
  if (old && (old.depth > a.depth || (old.depth === a.depth && old.lines.length > a.lines.length))) return prev;
  const next = new Map(prev);
  next.set(key, a);
  return next;
}

/**
 * Grades each move of the line from the engine results seen so far. A move is
 * graded once both the position before it and the one after it have been
 * analysed; the rest stay undefined until the player visits them.
 */
export function gradeLine(
  start: string,
  history: { fenAfter: string; uci: string }[],
  seen: Map<string, PositionAnalysis>,
  theory: boolean[],
): (MoveJudgement | undefined)[] {
  const out: (MoveJudgement | undefined)[] = [];
  let inBook = true;
  history.forEach((m, i) => {
    // Theory ends at the first move off the book, or the first book move the engine calls a mistake.
    inBook = inBook && !!theory[i] && (i === 0 || out[i - 1] === undefined || out[i - 1]!.classification === 'book');
    const fenBefore = i === 0 ? start : history[i - 1]!.fenAfter;
    const before = seen.get(positionKey(fenBefore));
    const after = seen.get(positionKey(m.fenAfter));
    const best = before?.lines[0];
    const playedScore = after?.terminal ? terminalScore(after.fen, after.terminal) : after?.lines[0]?.score;
    if (!best || !playedScore) return out.push(undefined);
    out.push(
      classifyMove({
        fenBefore,
        uci: m.uci,
        bestScore: best.score,
        bestMove: best.pv[0],
        secondBestScore: before.lines[1]?.score,
        playedScore,
        playedLine: after?.lines[0]?.pv,
        book: inBook,
        previousUci: history[i - 1]?.uci,
        previousLoss: out[i - 1]?.loss,
      }),
    );
  });
  return out;
}
