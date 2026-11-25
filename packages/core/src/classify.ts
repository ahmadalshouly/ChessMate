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
 * Makes the side to move's cheapest legal capture on `square` (never en
 * passant: the square holds the piece being taken) and returns it, or null
 * when there is none. Finds the capturers with `attackers()` and tries them
 * cheapest first: chess.js's verbose move list would build the SAN and two
 * FENs of every legal move in the position just to pick one, which made
 * grading a game's moves slow. Pieces of equal value are tried in board
 * order, the same order the move list has.
 */
function makeCheapestCapture(chess: Chess, square: Square): Move | null {
  const target = chess.get(square);
  if (!target || target.color === chess.turn()) return null;
  const capturers = (chess.attackers(square, chess.turn()) as Square[]).map((sq) => ({ sq, type: chess.get(sq)!.type })).sort((a, b) => VALUE[a.type] - VALUE[b.type]);
  for (const c of capturers) {
    try {
      return chess.move({ from: c.sq, to: square, promotion: c.type === 'p' && (square[1] === '8' || square[1] === '1') ? 'q' : undefined });
    } catch {
      // Pinned, or a king stepping into check.
    }
  }
  return null;
}

/** Material a capture wins: the piece taken, plus what a promotion adds. */
const captureGain = (m: Move) => VALUE[m.captured!] + (m.promotion ? VALUE[m.promotion as PieceType] - 1 : 0);

/**
 * Static exchange on `square` for the side to move: the material it can win
 * by starting a capture sequence there, always recapturing with the cheapest
 * legal piece and stopping when continuing would lose. Legal-move based, so
 * pinned pieces do not take part.
 */
export function staticExchange(chess: Chess, square: Square): number {
  const m = makeCheapestCapture(chess, square);
  if (!m) return 0;
  const reply = staticExchange(chess, square);
  chess.undo();
  return Math.max(0, captureGain(m) - reply);
}

/** Net material the opponent could win on each of the mover's pieces (not pawns or king), with the opponent to move. */
function looseMaterial(chess: Chess, mover: Color): Map<Square, number> {
  const out = new Map<Square, number>();
  const opponent: Color = mover === 'w' ? 'b' : 'w';
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (!p || p.color !== mover || p.type === 'k' || p.type === 'p') continue;
    // Cheap check first: a piece nothing attacks can't be won (the exchange below lists every legal move).
    if (!chess.isAttacked(sq, opponent)) continue;
    const won = staticExchange(chess, sq);
    if (won > 0) out.set(sq, won);
  }
  return out;
}

/** What was already loose before the move: the same position with the opponent to move. */
function looseBefore(fenBefore: string, mover: Color): Map<Square, number> {
  const f = fenBefore.split(' ');
  f[1] = mover === 'w' ? 'b' : 'w';
  f[3] = '-';
  try {
    return looseMaterial(new Chess(f.join(' ')), mover);
  } catch {
    return new Map();
  }
}

/**
 * Material the mover wins straight back after the opponent takes on `square`:
 * the best capture elsewhere on the board (captures on `square` itself are
 * already part of the exchange). A "sacrifice" that is recouped at once, such
 * as leaving a knight en prise while attacking the queen, is just a trade.
 */
function immediateRecoup(chess: Chess, square: Square): number {
  if (!makeCheapestCapture(chess, square)) return 0;
  // The mover's captures anywhere else. No en passant: the last move was a capture, not a double pawn step.
  const mover = chess.turn();
  let best = 0;
  for (const to of ALL_SQUARES) {
    const p = to === square ? null : chess.get(to);
    if (!p || p.color === mover || p.type === 'k') continue;
    for (const from of chess.attackers(to, mover) as Square[]) {
      const promoting = chess.get(from)!.type === 'p' && (to[1] === '8' || to[1] === '1');
      for (const promotion of promoting ? PROMOTIONS : [undefined]) {
        let m: Move;
        try {
          m = chess.move({ from, to, promotion });
        } catch {
          break;
        }
        const back = staticExchange(chess, to);
        chess.undo();
        best = Math.max(best, captureGain(m) - back);
      }
    }
  }
  chess.undo();
  return best;
}

const PROMOTIONS = ['q', 'r', 'b', 'n'] as const;

/**
 * The least material the mover could have left to be taken, net of what the
 * move itself captures, over every legal move other than `playedUci`: what was
 * lost whatever the mover did. Only needed when a move leaves a piece that was
 * already attacked, which is rare, so the full move list is affordable here.
 */
function unavoidableLoss(fenBefore: string, playedUci: string): number {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() as Color;
  let least = Infinity;
  for (const m of chess.moves({ verbose: true })) {
    if (m.from + m.to + (m.promotion ?? '') === playedUci) continue;
    chess.move(m);
    let most = 0;
    for (const won of looseMaterial(chess, mover).values()) most = Math.max(most, won);
    chess.undo();
    least = Math.min(least, Math.max(0, most - (m.captured ? captureGain(m) : 0)));
    if (least === 0) break;
  }
  return least === Infinity ? 0 : least;
}

/** Material balance for `side`, in pawns. */
function balance(chess: Chess, side: Color): number {
  let sum = 0;
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (p) sum += p.color === side ? VALUE[p.type] : -VALUE[p.type];
  }
  return sum;
}

/** Moves of the engine's line after a sacrifice in which the material must come back. */
const WIN_BACK_PLIES = 7;

/**
 * True when, along the engine's best line after the move (`line`, starting
 * with the opponent's reply), the mover wins the material back within a few
 * moves: after one of the opponent's replies the mover is no more than a pawn
 * down compared with before the move. Checked after the opponent's replies so
 * that a capture which is simply taken back does not count.
 */
export function winsMaterialBack(fenBefore: string, uci: string, line: readonly string[]): boolean {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() as Color;
  const start = balance(chess, mover);
  try {
    chess.move(parseUci(uci));
    for (let i = 0; i < Math.min(line.length, WIN_BACK_PLIES); i++) {
      chess.move(parseUci(line[i]!));
      if (i >= 2 && i % 2 === 0 && balance(chess, mover) >= start - 1) return true;
    }
  } catch {
    // A line that does not fit the position (stale or cut short) proves nothing.
  }
  return false;
}

/**
 * Finds the material a move really offers: a piece the move puts (or leaves)
 * where the opponent can take it for profit. To count, the offer must be new
 * (a piece that was already loose before the move, and that no move could
 * have saved, is not a sacrifice), worth
 * at least a minor piece net of what the move captured, and not won straight
 * back by an obvious capture after the opponent takes. Returns the biggest
 * such offer, or null when the move is not a sacrifice.
 */
export function findSacrifice(fenBefore: string, uci: string): Sacrifice | null {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() as Color;
  let before: Map<Square, number> | null = null;
  let unavoidable: number | undefined;
  let played: Move;
  try {
    played = chess.move(parseUci(uci));
  } catch {
    return null;
  }
  // A move that ends the game offers nothing.
  if (chess.isGameOver()) return null;
  // What the move itself won (a capture, a promotion) pays back part of any offer.
  const gained = played.captured || played.promotion ? captureGain(played) : 0;
  let best: Sacrifice | null = null;
  for (const [sq, won] of looseMaterial(chess, mover)) {
    const p = chess.get(sq)!;
    const amount = won - gained;
    if (amount < 2) continue;
    before ??= looseBefore(fenBefore, mover);
    const already = before.get(sq === played.to ? played.from : sq) ?? 0;
    if (amount - already < 2) {
      // It was attacked already. Leaving it there is still an offer when another
      // move would have kept the material (Fischer's 17...Be6!! leaves the queen
      // that Bc5 attacked); a piece that was lost whatever the mover did is not.
      unavoidable ??= unavoidableLoss(fenBefore, uci);
      if (amount - unavoidable < 2) continue;
    }
    if (amount - immediateRecoup(chess, sq) < 2) continue;
    if (!best || amount > best.amount || (amount === best.amount && VALUE[p.type] > VALUE[best.piece])) {
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
  /** Engine's best line after the played move (opponent's reply first), used to see whether sacrificed material comes back. */
  playedLine?: readonly string[];
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
    // Only searched for a move that could earn !! or !!! (most moves can't): it is slow.
    sacrifice: movedPiece ? () => findSacrifice(input.fenBefore, input.uci) : null,
    winsMaterialBack: () => !!input.playedLine?.length && winsMaterialBack(input.fenBefore, input.uci, input.playedLine),
    isRecapture,
    previousLoss: input.previousLoss,
  });
}
