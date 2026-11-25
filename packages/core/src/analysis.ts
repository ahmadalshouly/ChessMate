import { Chess } from 'chess.js';
import { quickFeedback } from './moveFeedback';
import { classifyMove } from './classify';
import { MOVE_CLASSES, gameAccuracy, toWhitePov, type MoveClass, type MoveJudgement, type Score } from './evaluation';
import { Game, START_FEN, parseUci, toUci } from './game';
import { bookTimeline } from './openings';
import { fenProblem } from './setup';
import { analyzePosition } from './threats';
import type { Color } from './types';
import type { UciInfo } from './uci';

/**
 * Engine analysis shared by the game server (which runs Stockfish) and the
 * clients (which render eval bars, arrows and game reviews).
 */

/** One principal variation. Scores are always from White's point of view. */
export interface EngineLine {
  multipv: number;
  depth: number;
  score: Score;
  /** Moves in UCI. */
  pv: string[];
  /** Same moves in SAN, for display. */
  san: string[];
}

export interface PositionAnalysis {
  fen: string;
  depth: number;
  /** Ordered best first. */
  lines: EngineLine[];
  /** Set when the position is already decided (mate or draw on the board). */
  terminal?: 'checkmate' | 'stalemate' | 'draw';
}

/** Limits the server enforces for interactive analysis. */
export const ANALYSIS_LIMITS = {
  maxMultiPv: 5,
  defaultDepth: 22,
  maxDepth: 30,
  maxMoveTimeMs: 15_000,
  /** Longest game the server will review, in plies. */
  maxReviewPlies: 400,
} as const;

/** Converts PV moves to SAN, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv) {
    try {
      const { from, to, promotion } = parseUci(uci);
      out.push(chess.move({ from, to, promotion }).san);
    } catch {
      break;
    }
  }
  return out;
}

/** Builds a display line from a raw UCI info record (scores relative to side to move). */
export function lineFromInfo(fen: string, info: UciInfo): EngineLine | null {
  if (!info.score || !info.pv?.length || info.bound) return null;
  const sideToMove = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  return {
    multipv: info.multipv ?? 1,
    depth: info.depth ?? 0,
    score: toWhitePov(info.score, sideToMove),
    pv: info.pv,
    san: pvToSan(fen, info.pv),
  };
}

/** Detects positions the engine should not be asked about. */
export function terminalState(fen: string): PositionAnalysis['terminal'] | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) return 'draw';
  return undefined;
}

/** Score for a finished position, White's view. In checkmate the side to move has lost. */
export function terminalScore(fen: string, terminal: NonNullable<PositionAnalysis['terminal']>): Score {
  return terminal === 'checkmate' ? MATED[fen.split(' ')[1] === 'b' ? 'b' : 'w'] : { cp: 0 };
}

/** True for the sentinel score used for positions that are already mate. */
export function isMatedScore(score: Score): boolean {
  return score.cp !== undefined && Math.abs(score.cp) >= 100_000;
}

/** Board position key without move counters, used to match live games. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** Score for "this side is checkmated", White's view. */
const MATED: Record<Color, Score> = { w: { cp: -100_000 }, b: { cp: 100_000 } };

// ---------- PGN / FEN import ----------

export interface ImportedGame {
  initialFen: string;
  moves: string[];
  headers: Record<string, string>;
}

/**
 * Accepts a FEN, a PGN, or a bare move list ("1. e4 e5 2. Nf3").
 * Returns null when nothing usable was found.
 */
export function importPosition(text: string): ImportedGame | null {
  const input = text.trim();
  if (!input) return null;
  // FEN: 6 (or 4) space separated fields with 8 ranks.
  if (/^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]\b/.test(input)) {
    try {
      const g = new Game(input.split('\n')[0]!.trim());
      // A FEN the rules read but the engine must not see (the side that just moved in check).
      if (fenProblem(g.fen)) return null;
      return { initialFen: g.fen, moves: [], headers: {} };
    } catch {
      return null;
    }
  }
  const chess = new Chess();
  try {
    chess.loadPgn(input);
  } catch {
    return null;
  }
  const headers = Object.fromEntries(Object.entries(chess.getHeaders()).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  const initialFen = headers.FEN && headers.SetUp !== '0' ? new Chess(headers.FEN).fen() : START_FEN;
  const moves = chess.history({ verbose: true }).map(toUci);
  if (moves.length === 0 && !headers.FEN) return null;
  return { initialFen, moves, headers };
}

// ---------- game review ----------

/** Best play in one position, as found by the engine. */
export interface PositionEval {
  /** Engine score with best play, White's view. */
  score: Score;
  /** Engine's best move in UCI, absent in finished positions. */
  bestMove?: string;
  /** Best line in UCI. */
  pv: string[];
  depth: number;
  /** Score of the engine's second choice (multipv 2), White's view. Lets the review spot only moves. */
  secondScore?: Score;
}

export interface ReviewedMove {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Best-play score before the move (White's view). */
  scoreBefore: Score;
  /** Best-play score after the move (White's view). */
  scoreAfter: Score;
  bestMove: string;
  bestSan: string;
  bestLine: string[];
  judgement: MoveJudgement;
  /** Deterministic one-line explanation of the move. */
  feedback: string;
}

export interface GameReview {
  initialFen: string;
  moves: ReviewedMove[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Record<MoveClass, number>>;
  /** Engine depth used for the review: the shallowest search behind any graded move. */
  depth: number;
  /** The deepest search behind any graded move, when deeper than `depth` (some moves were searched again deeper). */
  maxDepth?: number;
}


/**
 * Builds a full review from per-position engine results.
 * `evals[i]` is the analysis of the position before move i; `evals[moves.length]`
 * is the final position.
 *
 * `previous` is an earlier review of the same game, or of its start (a review
 * being filled in as moves are graded). Each move's grade depends only on the
 * moves and results up to it, so the moves it already graded with the same
 * engine results are kept as they are and only the rest are graded. Grading a
 * move is the slow part (the board checks for sacrifices and tactics), so
 * rebuilding from scratch every time a few more moves come in grew with the
 * square of the game's length.
 */
export function buildReview(initialFen: string, moves: string[], evals: PositionEval[], previous?: GameReview | null): GameReview {
  if (evals.length !== moves.length + 1) throw new Error('Need one evaluation per position');
  const kept = previous ? reusableMoves(previous, initialFen, moves, evals) : [];
  const game = new Game(kept.length ? kept[kept.length - 1]!.fenAfter : initialFen);
  const reviewed: ReviewedMove[] = [...kept];
  const counts = {
    w: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])),
    b: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])),
  } as GameReview['counts'];
  const acc: Record<Color, number[]> = { w: [], b: [] };
  let depth = Infinity;
  let maxDepth = 0;
  // Moves stay theory while every position so far lies on a known opening line.
  const theory = bookTimeline(moves, initialFen);
  // Still in theory after the kept moves only if every one of them was a theory move.
  let inBook = kept.every((m) => m.judgement.classification === 'book');
  let previousLoss: number | undefined = kept[kept.length - 1]?.judgement.loss;
  for (const m of kept) {
    counts[m.color][m.judgement.classification]++;
    acc[m.color].push(m.judgement.accuracy);
  }
  for (let i = 0; i < kept.length; i++) {
    depth = Math.min(depth, evals[i]!.depth || depth);
    maxDepth = Math.max(maxDepth, evals[i]!.depth);
  }

  moves.forEach((uci, i) => {
    if (i < kept.length) return;
    const before = evals[i]!;
    const after = evals[i + 1]!;
    const fenBefore = game.fen;
    const mover = game.turn;
    // SAN strings, not verbose moves: chess.js builds two FENs and the SAN of every verbose move.
    const legalMoveCount = game.raw.moves().length;
    const played = game.move(uci);
    inBook = inBook && theory[i]!;
    if (!played) throw new Error(`Illegal move in review: ${uci}`);
    const fenAfter = game.fen;
    const term = terminalState(fenAfter);
    // A delivered mate is judged as a won position for the mover.
    const playedScoreForJudge = term === 'checkmate' ? MATED[game.turn] : after.score;
    const bestMove = before.bestMove ?? played.uci;
    const judgement = classifyMove({
      fenBefore,
      uci: played.uci,
      bestScore: before.score,
      bestMove,
      secondBestScore: before.secondScore,
      playedScore: playedScoreForJudge,
      legalMoveCount,
      book: inBook,
      previousUci: moves[i - 1],
      previousLoss,
    });
    previousLoss = judgement.loss;
    // A book move the engine calls a mistake takes the game out of theory for good.
    if (judgement.classification !== 'book') inBook = false;
    const bestLine = pvToSan(fenBefore, before.pv.length ? before.pv.slice(0, BEST_LINE_PLIES) : [bestMove]);
    const bestSan = bestLine[0] ?? played.san;
    reviewed.push({
      ply: i + 1,
      color: mover,
      san: played.san,
      uci: played.uci,
      fenBefore,
      fenAfter,
      scoreBefore: before.score,
      scoreAfter: after.score,
      bestMove,
      bestSan,
      bestLine,
      judgement,
      feedback: quickFeedback({ movePlayed: played.san, bestMove: bestSan, judgement, insightAfter: () => analyzePosition(fenAfter, mover) }),
    });
    counts[mover][judgement.classification]++;
    acc[mover].push(judgement.accuracy);
    depth = Math.min(depth, before.depth || depth);
    maxDepth = Math.max(maxDepth, before.depth);
  });

  return {
    initialFen: new Game(initialFen).fen,
    moves: reviewed,
    accuracy: { w: gameAccuracy(acc.w), b: gameAccuracy(acc.b) },
    counts,
    depth: Number.isFinite(depth) ? depth : 0,
    ...(Number.isFinite(depth) && maxDepth > depth ? { maxDepth } : {}),
  };
}

/** Moves of the engine's line kept (in SAN) on each reviewed move: the review shows six. Each costs chess.js a full legal-move generation. */
const BEST_LINE_PLIES = 8;

const sameScore = (a: Score, b: Score) => a.cp === b.cp && a.mate === b.mate;

/** The moves of `previous` that grade the same with these moves and engine results. */
function reusableMoves(previous: GameReview, initialFen: string, moves: string[], evals: PositionEval[]): ReviewedMove[] {
  if (previous.initialFen !== new Game(initialFen).fen) return [];
  let n = 0;
  for (const m of previous.moves) {
    const i = m.ply - 1;
    // `previous` may run past these moves (a shorter prefix of it is wanted): its start is still good.
    if (i >= moves.length || i !== n || m.uci !== moves[i]) break;
    const before = evals[i]!;
    const after = evals[i + 1]!;
    if (!sameScore(m.scoreBefore, before.score) || !sameScore(m.scoreAfter, after.score) || m.bestMove !== (before.bestMove ?? m.uci)) break;
    n++;
  }
  return previous.moves.slice(0, n);
}

/** Converts raw UCI evaluations (side-to-move relative) for a terminal-aware review. */
export function positionEvalFrom(
  fen: string,
  info: { score?: Score; pv?: string[]; depth?: number } | null,
  bestMove?: string,
  second?: { score?: Score } | null,
): PositionEval {
  const term = terminalState(fen);
  if (term) return { score: terminalScore(fen, term), pv: [], depth: 0 };
  const side = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  return {
    score: info?.score ? toWhitePov(info.score, side) : { cp: 0 },
    bestMove: bestMove ?? info?.pv?.[0],
    pv: info?.pv ?? (bestMove ? [bestMove] : []),
    depth: info?.depth ?? 0,
    ...(second?.score ? { secondScore: toWhitePov(second.score, side) } : {}),
  };
}
