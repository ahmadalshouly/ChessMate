import { Chess, type Move } from 'chess.js';
import { judgeMove, type MoveJudgement, type Score } from './evaluation';
import { parseUci } from './game';
import { ALL_SQUARES, PIECE_VALUES, type Color, type PieceType, type Square } from './types';

/**
 * Board-aware move classification. `judgeMove` decides from engine scores
 * alone; this module adds the facts it needs from the board itself: whether
 * the move gave material away (a sacrifice), and whether it was a plain
 * recapture. Both the server review and the analysis board use it, so a move
 * gets the same badge everywhere.
 */

/** Material the mover offers with a move, from a static exchange estimate. */
export interface Sacrifice {
  /** Square of the piece left to be taken. */
  square: Square;
  piece: PieceType;
  /** Net material the opponent can win, in pawns (after the mover's capture, if any). */
  amount: number;
}

const VALUE: Record<PieceType, number> = { ...PIECE_VALUES, k: 0 };

/**
 * Static exchange on `square` for the side to move: the material it can win
 * by starting a capture sequence there, always recapturing with the cheapest
 * legal piece and stopping when continuing would lose. Legal-move based, so
 * pinned pieces do not take part.
 */
export function staticExchange(chess: Chess, square: Square): number {
  const captures = (chess.moves({ verbose: true }) as Move[]).filter((m) => m.to === square && m.captured && !m.isEnPassant());
  if (captures.length === 0) return 0;
  captures.sort((a, b) => VALUE[a.piece] - VALUE[b.piece]);
  const m = captures[0]!;
  const gained = VALUE[m.captured!] + (m.promotion ? VALUE[m.promotion] - 1 : 0);
  chess.move(m);
  const reply = staticExchange(chess, square);
  chess.undo();
  return Math.max(0, gained - reply);
}

/**
 * Finds the material a move offers: the moved piece left where it can be
 * taken for profit, or another piece the move leaves (or keeps) en prise.
 * Returns the biggest offer of at least a minor piece's worth of net material,
 * or null when the move is not a sacrifice.
 */
export function findSacrifice(fenBefore: string, uci: string): Sacrifice | null {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() as Color;
  let played: Move;
  try {
    played = chess.move(parseUci(uci));
  } catch {
    return null;
  }
  // A move that ends the game offers nothing.
  if (chess.isGameOver()) return null;
  const capturedValue = played.captured ? VALUE[played.captured] : 0;
  let best: Sacrifice | null = null;
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (!p || p.color !== mover || p.type === 'k' || p.type === 'p') continue;
    const won = staticExchange(chess, sq);
    if (won <= 0) continue;
    // What the mover just took pays back part of an offer on the destination square.
    const amount = sq === played.to ? won - capturedValue : won;
    if (amount >= 2 && (!best || amount > best.amount || (amount === best.amount && VALUE[p.type] > VALUE[best.piece]))) {
      best = { square: sq, piece: p.type, amount };
    }
  }
  return best;
}

export interface ClassifyInput {
  /** Position before the move. */
  fenBefore: string;
  /** Move played, in UCI. */
  uci: string;
  /** Best-play score before the move, White's view. */
  bestScore: Score;
  /** Engine's best move before, in UCI, when known. */
  bestMove?: string;
  /** Score of the engine's second choice before the move (multipv 2), White's view. */
  secondBestScore?: Score;
  /** Score after the played move with best play from there, White's view. */
  playedScore: Score;
  /** Number of legal moves before. Computed from the position when absent. */
  legalMoveCount?: number;
  /** True when the move is a known opening move. */
  book?: boolean;
  /** The opponent's previous move, in UCI, used to spot recaptures. */
  previousUci?: string;
  /** Expected-score loss of the opponent's previous move, used to spot missed chances. */
  previousLoss?: number;
}

/** Classifies one move from engine scores plus what the move does on the board. */
export function classifyMove(input: ClassifyInput): MoveJudgement {
  const chess = new Chess(input.fenBefore);
  const mover = chess.turn() as Color;
  const legalMoveCount = input.legalMoveCount ?? chess.moves().length;
  let movedPiece: PieceType | undefined;
  let isRecapture = false;
  try {
    const m = chess.move(parseUci(input.uci));
    movedPiece = m.piece;
    isRecapture = !!m.captured && !!input.previousUci && input.previousUci.slice(2, 4) === m.to;
  } catch {
    // Unknown move: judge on scores alone.
  }
  return judgeMove({
    mover,
    bestScore: input.bestScore,
    playedScore: input.playedScore,
    playedIsBest: input.bestMove !== undefined && input.bestMove === input.uci,
    legalMoveCount,
    book: input.book,
    secondBestScore: input.secondBestScore,
    sacrifice: movedPiece ? findSacrifice(input.fenBefore, input.uci) : null,
    movedPiece,
    isRecapture,
    previousLoss: input.previousLoss,
  });
}
