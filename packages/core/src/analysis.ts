import { Chess } from 'chess.js';
import type { CoachContext } from './coach';
import { quickFeedback } from './coach';
import { classifyMove } from './classify';
import { MOVE_CLASSES, gameAccuracy, toWhitePov, type MoveClass, type MoveJudgement, type Score } from './evaluation';
import { Game, START_FEN, parseUci, toUci } from './game';
import { openingTimeline } from './openings';
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
  /** Deterministic one-line explanation (the AI coach can expand on it). */
  feedback: string;
}

export interface GameReview {
  initialFen: string;
  moves: ReviewedMove[];
  accuracy: Record<Color, number>;
  counts: Record<Color, Record<MoveClass, number>>;
  /** Engine depth used for the review. */
  depth: number;
}


/**
 * Builds a full review from per-position engine results.
 * `evals[i]` is the analysis of the position before move i; `evals[moves.length]`
 * is the final position.
 */
export function buildReview(initialFen: string, moves: string[], evals: PositionEval[]): GameReview {
  if (evals.length !== moves.length + 1) throw new Error('Need one evaluation per position');
  const game = new Game(initialFen);
  const reviewed: ReviewedMove[] = [];
  const counts = {
    w: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])),
    b: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])),
  } as GameReview['counts'];
  const acc: Record<Color, number[]> = { w: [], b: [] };
  let depth = Infinity;
  // Moves stay "book" while every position so far is a named opening.
  const openings = openingTimeline(moves, initialFen);
  let inBook = true;
  let previousLoss: number | undefined;

  moves.forEach((uci, i) => {
    const before = evals[i]!;
    const after = evals[i + 1]!;
    const fenBefore = game.fen;
    const mover = game.turn;
    const legalMoveCount = game.legalMoves().length;
    const played = game.move(uci);
    inBook = inBook && !!openings[i + 1] && openings[i + 1]!.ply === i + 1;
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
    const bestLine = pvToSan(fenBefore, before.pv.length ? before.pv : [bestMove]);
    const bestSan = bestLine[0] ?? played.san;
    const insightAfter = analyzePosition(fenAfter, mover);
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
      feedback: quickFeedback({ movePlayed: played.san, bestMove: bestSan, judgement, insightAfter }),
    });
    counts[mover][judgement.classification]++;
    acc[mover].push(judgement.accuracy);
    depth = Math.min(depth, before.depth || depth);
  });

  return {
    initialFen: new Game(initialFen).fen,
    moves: reviewed,
    accuracy: { w: gameAccuracy(acc.w), b: gameAccuracy(acc.b) },
    counts,
    depth: Number.isFinite(depth) ? depth : 0,
  };
}

/** Structured input for the AI coach about one reviewed move. */
export function coachContextFor(review: GameReview, ply: number, playerRating?: number): CoachContext | null {
  const m = review.moves[ply - 1];
  if (!m) return null;
  return {
    fenBefore: m.fenBefore,
    movePlayed: m.san,
    mover: m.color,
    playerRating,
    bestMove: m.bestSan,
    bestLine: m.bestLine,
    scoreBefore: m.scoreBefore,
    scoreAfter: m.scoreAfter,
    judgement: m.judgement,
    insightAfter: analyzePosition(m.fenAfter, m.color),
  };
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
