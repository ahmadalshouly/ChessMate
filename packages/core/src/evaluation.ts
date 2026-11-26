import type { Color, PieceType } from './types';

/** Engine score. Always from White's point of view. */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

/**
 * Move classes, strongest first:
 * - masterpiece (!!!): a queen or rook sacrifice that leads to a forced
 *   mate. ChessMate's own top tier, above brilliant.
 * - brilliant (!!): a sacrifice that pays off; the best (or near best) move
 *   gives material away and it leads to mate, gives the mover the advantage,
 *   or wins the material back within a few moves. Not every sacrifice is
 *   brilliant: one that only keeps the balance is not.
 * - great (!): the only good move; every alternative is clearly worse.
 * - best, excellent, good: close to the engine's choice.
 * - book: a known opening move. forced: the only legal move.
 * - inaccuracy (?!), mistake (?), blunder (??): increasing loss.
 * - miss: the opponent just erred and the move let the chance slip.
 */
export type MoveClass =
  | 'masterpiece'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'book'
  | 'forced';

/** Every class, in display order (strongest first). */
export const MOVE_CLASSES: MoveClass[] = ['masterpiece', 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** Logistic slope converting centipawns to expected score. */
const K = 0.004;

/** Expected score (0..1) for White given an engine score. */
export function expectedScore(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 1 : score.mate < 0 ? 0 : 0.5;
  return 1 / (1 + Math.exp(-K * score.cp));
}

export function expectedScoreFor(score: Score, color: Color): number {
  const s = expectedScore(score);
  return color === 'w' ? s : 1 - s;
}

/** Converts a score reported relative to the side to move into White's view. */
export function toWhitePov(score: Score, sideToMove: Color): Score {
  if (sideToMove === 'w') return score;
  return score.mate !== undefined ? { mate: -score.mate } : { cp: -score.cp };
}

export function formatScore(score: Score): string {
  if (score.mate !== undefined) return score.mate === 0 ? '#' : `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`;
  const p = score.cp / 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}`;
}

/** Fill fraction (0..1) for an evaluation bar, White at the bottom. */
export function evalBarFraction(score: Score): number {
  return expectedScore(score);
}

export interface MoveJudgement {
  classification: MoveClass;
  /** Drop in expected score for the mover, 0..1. */
  loss: number;
  /** Per-move accuracy 0..100. */
  accuracy: number;
}

/**
 * Expected-points loss bands, as chess.com publishes them: best 0, excellent
 * up to 0.02, good up to 0.05, inaccuracy up to 0.10, mistake up to 0.20,
 * blunder beyond.
 */
const THRESHOLDS: [MoveClass, number][] = [
  ['excellent', 0.02],
  ['good', 0.05],
  ['inaccuracy', 0.1],
  ['mistake', 0.2],
];

/** Loss below which a move counts as "as good as the best". */
const BEST_LOSS = 0.005;
/** Loss a sacrifice or only move may have and still earn !!, !!! or !: the best move or within a hair of it. */
const TOP_LOSS = 0.01;
/** How much worse the engine's second choice must be for an only move (!). */
const ONLY_MOVE_GAP = 0.15;
/** Expected score a sacrifice must keep for the mover to be sound. */
const SOUND_AFTER = 0.45;
/** Expected score (about +1 by centipawns) at which a sacrifice has given the mover the advantage. */
const ADVANTAGE = 0.6;
/**
 * At or above this expected score (about +4.3 by centipawns, not mate) with
 * the engine's second choice too, the mover is already completely winning, so
 * a sacrifice or only move is not special: plenty of moves win. A position
 * that wins only with the best move (a combination) is not "already won".
 */
const ALREADY_WINNING = 0.85;
/** Mates in this many moves or fewer every search finds exactly. */
const SHORT_MATE = 3;
/** A theory move keeps its badge unless the engine calls it a mistake or worse. */
const BOOK_MAX_LOSS = 0.1;
/** Opponent's previous move loss that opens a chance worth noticing. */
const CHANCE = 0.15;
/** Loss at which letting such a chance go counts as a miss. */
const MISS_LOSS = 0.1;

/** What `classifyMove` found the move gives up (see `findSacrifice`). */
export interface SacrificeFacts {
  /** The piece offered. */
  piece: PieceType;
  /** Net material the opponent can win, in pawns (after the mover's capture, if any). */
  amount: number;
  /** The piece can't really be taken: the mover wins as much straight back. */
  trap?: boolean;
  /** The material was lost whatever the mover played (counts only for a mate). */
  lostAnyway?: boolean;
}

/**
 * Judges a move by how much expected score the mover gave up compared with
 * the engine's best line, then upgrades strong moves (sacrifices, only moves)
 * and marks missed chances. The board facts (`sacrifice`, `winsMaterialBack`,
 * `isRecapture`) come from `classifyMove`.
 */
export function judgeMove(params: {
  mover: Color;
  bestScore: Score;
  playedScore: Score;
  playedIsBest: boolean;
  legalMoveCount?: number;
  book?: boolean;
  /** Engine's second choice before the move (White's view), when analysed with multipv 2+. */
  secondBestScore?: Score;
  /**
   * Material the move offers, if any. Finding it is the costly part of judging
   * a move, so it may be passed as a function, called only for a move that
   * could earn !! or !!!.
   */
  sacrifice?: SacrificeFacts | null | (() => SacrificeFacts | null);
  /** Whether the engine's line after the move wins the sacrificed material back within a few moves (asked only for a sacrifice). */
  winsMaterialBack?: boolean | (() => boolean);
  isRecapture?: boolean;
  /** Loss of the opponent's previous move. */
  previousLoss?: number;
}): MoveJudgement {
  const before = expectedScoreFor(params.bestScore, params.mover);
  const after = expectedScoreFor(params.playedScore, params.mover);
  const loss = Math.max(0, before - after);
  const accuracy = moveAccuracy(loss);
  if (params.legalMoveCount === 1) return { classification: 'forced', loss, accuracy };
  if (params.book && loss < BOOK_MAX_LOSS) return { classification: 'book', loss, accuracy: 100 };

  const top = params.playedIsBest || loss < TOP_LOSS;
  // Completely winning whatever the mover plays: the best move and the second choice both win easily.
  const second = params.secondBestScore ? expectedScoreFor(params.secondBestScore, params.mover) : before;
  const easilyWinning = params.bestScore.mate === undefined && before >= ALREADY_WINNING && second >= ALREADY_WINNING;
  const forMover = (s: Score) => s.mate !== undefined && (params.mover === 'w' ? s.mate > 0 : s.mate < 0);
  // The move forces mate, and no slower than a mate the engine had already seen
  // (one move of slack for a long mate, which separate searches may count
  // differently; a short one every search finds exactly): dragging out a won
  // mating attack is not special.
  const playedMate = Math.abs(params.playedScore.mate ?? 0);
  const bestMate = Math.abs(params.bestScore.mate ?? 0);
  const forcesMate =
    forMover(params.playedScore) && (!forMover(params.bestScore) || playedMate < bestMate || (playedMate === bestMate && bestMate > SHORT_MATE));
  // A sacrifice that forces mate counts even from a won position: the search
  // before the move just had not seen the mate yet.
  if (top && (!easilyWinning || forcesMate)) {
    const sac = after >= SOUND_AFTER ? (typeof params.sacrifice === 'function' ? params.sacrifice() : params.sacrifice) : null;
    if (sac && forcesMate) {
      // !!! (Masterpiece): the queen or a rook is given up, whichever piece moved, and it forces mate.
      return { classification: sac.piece === 'q' || sac.piece === 'r' ? 'masterpiece' : 'brilliant', loss, accuracy: 100 };
    }
    // !!: the sacrifice gives the mover the advantage, or the material comes back
    // within a few moves. One that only keeps the balance is just a good move,
    // and so is one that merely slows down a mate the mover already had. A
    // piece that can't be taken (taking it loses as much at once) must give
    // the advantage: its material always "comes back". Material that was lost
    // whatever the mover did counts only for a mate (above).
    if (sac && !sac.lostAnyway && !easilyWinning && !forMover(params.bestScore)) {
      const back = () => !sac.trap && (typeof params.winsMaterialBack === 'function' ? params.winsMaterialBack() : !!params.winsMaterialBack);
      if (after >= ADVANTAGE || back()) return { classification: 'brilliant', loss, accuracy: 100 };
    }
  }
  if (top && !easilyWinning && params.secondBestScore && !params.isRecapture && after >= SOUND_AFTER && before - second >= ONLY_MOVE_GAP) {
    return { classification: 'great', loss, accuracy: 100 };
  }
  if (params.playedIsBest || loss < BEST_LOSS) return { classification: 'best', loss, accuracy: 100 };

  let classification: MoveClass = 'blunder';
  for (const [cls, max] of THRESHOLDS) {
    if (loss < max) {
      classification = cls;
      break;
    }
  }
  // The opponent just erred and this move let most of the chance go, without throwing the game.
  if (loss >= MISS_LOSS && (params.previousLoss ?? 0) >= CHANCE && after >= SOUND_AFTER) classification = 'miss';
  return { classification, loss, accuracy };
}

export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 100 * Math.exp(-5 * loss)));
}

/** Game accuracy: harmonic-leaning mean so a few blunders weigh heavily. */
export function gameAccuracy(moveAccuracies: number[]): number {
  if (moveAccuracies.length === 0) return 100;
  const mean = moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length;
  const harmonic = moveAccuracies.length / moveAccuracies.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return Math.round(((mean + harmonic) / 2) * 10) / 10;
}
