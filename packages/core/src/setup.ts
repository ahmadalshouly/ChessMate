import { Chess, validateFen } from 'chess.js';
import { START_FEN } from './game';
import { ALL_SQUARES, FILES, type Color, type Piece, type PieceType, type Square } from './types';

/**
 * Board editor: set up any position by hand, then analyse it. A setup is the
 * pieces by square plus the other FEN fields. While it is being edited it may
 * not be a legal position yet (no kings, a pawn on the back rank);
 * `setupProblem` says what still has to change before the engine can look at it.
 */

export type CastlingRight = 'K' | 'Q' | 'k' | 'q';
export const CASTLING_RIGHTS: readonly CastlingRight[] = ['K', 'Q', 'k', 'q'];

export interface Setup {
  /** Pieces by square; empty squares are left out. */
  board: Partial<Record<Square, Piece>>;
  turn: Color;
  /**
   * Castling the player asked for. Only the rights the pieces allow (king and
   * rook on their home squares) are written to the FEN, see `castlingAllowed`,
   * so a right comes back by itself when the pieces return.
   */
  castling: Record<CastlingRight, boolean>;
  /** En passant square from a pasted FEN, written only while the board still fits it. */
  ep: Square | null;
  halfmove: number;
  fullmove: number;
}

/** Why a setup can't be analysed yet; null from `setupProblem` when it can. */
export type SetupProblem = 'whiteKing' | 'blackKing' | 'pawnsOnEdge' | 'tooManyPieces' | 'oppositeCheck' | 'invalid';

export const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

const PIECE_CHARS = 'pnbrqk';
const NO_CASTLING: Record<CastlingRight, boolean> = { K: false, Q: false, k: false, q: false };
const ALL_CASTLING: Record<CastlingRight, boolean> = { K: true, Q: true, k: true, q: true };

/** King and rook home squares for each castling right. */
const CASTLING_HOMES: Record<CastlingRight, { color: Color; king: Square; rook: Square }> = {
  K: { color: 'w', king: 'e1', rook: 'h1' },
  Q: { color: 'w', king: 'e1', rook: 'a1' },
  k: { color: 'b', king: 'e8', rook: 'h8' },
  q: { color: 'b', king: 'e8', rook: 'a8' },
};

/** Reads the piece placement field of a FEN; null unless it has 8 ranks of 8 squares. */
function readPlacement(field: string): Partial<Record<Square, Piece>> | null {
  const ranks = field.split('/');
  if (ranks.length !== 8) return null;
  const board: Partial<Record<Square, Piece>> = {};
  for (let i = 0; i < 8; i++) {
    const rank = 8 - i;
    let file = 0;
    for (const ch of ranks[i]!) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      const type = ch.toLowerCase();
      if (!PIECE_CHARS.includes(type) || file > 7) return null;
      board[`${FILES[file]}${rank}` as Square] = { color: ch === type ? 'b' : 'w', type: type as PieceType };
      file++;
    }
    if (file !== 8) return null;
  }
  return board;
}

function writePlacement(board: Setup['board']): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const f of FILES) {
      const p = board[`${f}${rank}` as Square];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    rows.push(empty ? row + String(empty) : row);
  }
  return rows.join('/');
}

/**
 * Reads a FEN for the editor. Only the piece placement is required: a missing
 * side to move is White, missing castling and en passant are none, and the
 * move counters start at 0 and 1. Positions that can't be played yet (no
 * kings) are read too. Null for anything that isn't a FEN.
 */
export function parseSetupFen(text: string): Setup | null {
  const fields = text.trim().split(/\s+/);
  if (fields.length > 6) return null;
  const board = readPlacement(fields[0] ?? '');
  if (!board) return null;
  const [, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fields;
  if (turn !== 'w' && turn !== 'b') return null;
  if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === '') return null;
  if (ep !== '-' && !/^[a-h][36]$/.test(ep)) return null;
  if (!/^\d{1,4}$/.test(half) || !/^\d{1,4}$/.test(full)) return null;
  return {
    board,
    turn,
    castling: { K: castling.includes('K'), Q: castling.includes('Q'), k: castling.includes('k'), q: castling.includes('q') },
    ep: ep === '-' ? null : (ep as Square),
    halfmove: Number(half),
    fullmove: Math.max(1, Number(full)),
  };
}

/** The starting position, with every castling right. */
export function startingSetup(): Setup {
  return parseSetupFen(START_FEN)!;
}

/** An empty board. Castling stays switched on, so it applies as soon as a king and rook stand on their home squares. */
export function emptySetup(turn: Color = 'w'): Setup {
  return { board: {}, turn, castling: { ...ALL_CASTLING }, ep: null, halfmove: 0, fullmove: 1 };
}

/** Which castling rights the pieces allow: the king and that rook on their home squares. */
export function castlingAllowed(board: Setup['board']): Record<CastlingRight, boolean> {
  const out = { ...NO_CASTLING };
  for (const right of CASTLING_RIGHTS) {
    const { color, king, rook } = CASTLING_HOMES[right];
    const k = board[king];
    const r = board[rook];
    out[right] = k?.color === color && k.type === 'k' && r?.color === color && r.type === 'r';
  }
  return out;
}

/** The castling rights that apply: asked for and allowed by the pieces. */
export function castlingRights(s: Setup): Record<CastlingRight, boolean> {
  const allowed = castlingAllowed(s.board);
  return { K: s.castling.K && allowed.K, Q: s.castling.Q && allowed.Q, k: s.castling.k && allowed.k, q: s.castling.q && allowed.q };
}

/** Whether the en passant square still fits the board: the pawn that just moved two squares is there, and the squares it crossed are empty. */
function epFits(s: Setup): boolean {
  if (!s.ep) return false;
  const file = s.ep[0];
  const rank = Number(s.ep[1]);
  // White to move: Black just played a pawn from rank 7 to rank 5, passing rank 6.
  const mover: Color = s.turn === 'w' ? 'b' : 'w';
  if (rank !== (mover === 'b' ? 6 : 3)) return false;
  const pawn = s.board[`${file}${mover === 'b' ? 5 : 4}` as Square];
  return pawn?.color === mover && pawn.type === 'p' && !s.board[s.ep] && !s.board[`${file}${mover === 'b' ? 7 : 2}` as Square];
}

/** FEN of a setup. Castling and en passant are written only where the board allows them. */
export function setupFen(s: Setup): string {
  const rights = castlingRights(s);
  const castling = CASTLING_RIGHTS.filter((r) => rights[r]).join('') || '-';
  return `${writePlacement(s.board)} ${s.turn} ${castling} ${epFits(s) ? s.ep : '-'} ${s.halfmove} ${s.fullmove}`;
}

/** Puts a piece on a square (null empties it). The board changed, so the fifty-move count starts again. */
export function putPiece(s: Setup, sq: Square, piece: Piece | null): Setup {
  const board = { ...s.board };
  if (piece) board[sq] = { color: piece.color, type: piece.type };
  else delete board[sq];
  return { ...s, board, halfmove: 0 };
}

/** Moves a piece to another square, replacing whatever stood there. */
export function movePiece(s: Setup, from: Square, to: Square): Setup {
  const piece = s.board[from];
  if (!piece || from === to) return s;
  return putPiece(putPiece(s, from, null), to, piece);
}

/**
 * What stops a setup being analysed, or null when it is a legal position:
 * one king each, no pawns on the first or last rank, at most 16 pieces and 8
 * pawns a side, and the side that just moved not left in check. The engine
 * must never see a position that breaks these (it can crash on one).
 */
export function setupProblem(s: Setup): SetupProblem | null {
  const count = { w: { all: 0, k: 0, p: 0 }, b: { all: 0, k: 0, p: 0 } };
  let pawnOnEdge = false;
  for (const sq of ALL_SQUARES) {
    const p = s.board[sq];
    if (!p) continue;
    const c = count[p.color];
    c.all++;
    if (p.type === 'k') c.k++;
    if (p.type === 'p') {
      c.p++;
      if (sq[1] === '1' || sq[1] === '8') pawnOnEdge = true;
    }
  }
  if (count.w.k !== 1) return 'whiteKing';
  if (count.b.k !== 1) return 'blackKing';
  if (pawnOnEdge) return 'pawnsOnEdge';
  if (count.w.all > 16 || count.b.all > 16 || count.w.p > 8 || count.b.p > 8) return 'tooManyPieces';
  const fen = setupFen(s);
  if (!validateFen(fen).ok) return 'invalid';
  // The side that just moved can't be in check: hand the move over and ask.
  const placement = fen.split(' ')[0];
  try {
    if (new Chess(`${placement} ${s.turn === 'w' ? 'b' : 'w'} - - 0 1`).inCheck()) return 'oppositeCheck';
  } catch {
    return 'invalid';
  }
  return null;
}

/** `setupProblem` for a FEN string; 'invalid' when it can't be read at all. */
export function fenProblem(fen: string): SetupProblem | null {
  const s = parseSetupFen(fen);
  return s ? setupProblem(s) : 'invalid';
}

/**
 * The pieces of a FEN as rows from rank 8 down to rank 1, files a to h, for
 * drawing a board. Unlike the rules engine it reads positions that can't be
 * played (no kings yet, in the editor); anything unreadable is an empty board.
 */
export function fenBoard(fen: string): (Piece | null)[][] {
  const board = readPlacement(fen.trim().split(/\s+/)[0] ?? '') ?? {};
  const rows: (Piece | null)[][] = [];
  for (let rank = 8; rank >= 1; rank--) rows.push(FILES.map((f) => board[`${f}${rank}` as Square] ?? null));
  return rows;
}
