import { Chess } from 'chess.js';
import type { Color, PieceType, Square } from './types';

/** Pieces a pawn can promote to, strongest first (the order the picker shows them). */
export const PROMOTION_PIECES = ['q', 'n', 'r', 'b'] as const;
export type PromotionPiece = (typeof PROMOTION_PIECES)[number];

/** A move queued while the opponent is thinking. */
export interface Premove {
  from: Square;
  to: Square;
  /** Chosen promotion piece when a pawn premoves to the last rank. */
  promotion?: PromotionPiece;
}

/** True when moving the piece on `from` to `to` is a pawn reaching its last rank. */
export function isPromotionMove(fen: string, from: Square, to: Square): boolean {
  const piece = pieceOn(fen, from);
  if (!piece || piece.toLowerCase() !== 'p') return false;
  return to[1] === (piece === 'P' ? '8' : '1');
}

/** FEN letter on a square (uppercase white), or null. Works on any placement, legal or not. */
function pieceOn(fen: string, sq: Square): string | null {
  return parseBoard(fen)[sqIndex(sq)] ?? null;
}

const sqIndex = (sq: Square) => (8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97);

function parseBoard(fen: string): (string | null)[] {
  const out: (string | null)[] = [];
  for (const ch of (fen.split(' ')[0] ?? '').replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
    else out.push(ch);
  }
  return out;
}

function boardFen(b: (string | null)[]): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = b[r * 8 + f];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

/**
 * The position as it will look once the queued premoves have played,
 * moving pieces geometrically (captures replace whatever stands there,
 * castling moves the rook, promotions use the chosen piece or a queen).
 * Used to draw the queue and to work out where the next premove can go.
 * Castling rights are kept only while king and rook are still home, and
 * the en passant square is cleared, so the FEN always loads.
 */
export function applyPremoves(fen: string, premoves: readonly Premove[]): string {
  if (premoves.length === 0) return fen;
  const parts = fen.split(' ');
  const b = parseBoard(fen);
  for (const pm of premoves) {
    const from = sqIndex(pm.from);
    const to = sqIndex(pm.to);
    const piece = b[from];
    if (!piece) continue;
    const white = piece === piece.toUpperCase();
    const type = piece.toLowerCase() as PieceType;
    b[from] = null;
    let placed = piece;
    if (type === 'p' && pm.to[1] === (white ? '8' : '1')) {
      const promo = pm.promotion ?? 'q';
      placed = white ? promo.toUpperCase() : promo;
    }
    b[to] = placed;
    // Castling: the king jumps two files, so bring the rook across.
    if (type === 'k' && Math.abs(pm.from.charCodeAt(0) - pm.to.charCodeAt(0)) === 2) {
      const rank = pm.to[1];
      const kingside = pm.to[0] === 'g';
      const rookFrom = sqIndex(`${kingside ? 'h' : 'a'}${rank}` as Square);
      const rookTo = sqIndex(`${kingside ? 'f' : 'd'}${rank}` as Square);
      if (b[rookFrom]?.toLowerCase() === 'r') {
        b[rookTo] = b[rookFrom]!;
        b[rookFrom] = null;
      }
    }
  }
  const rights = (parts[2] ?? '-')
    .split('')
    .filter((r) => {
      const white = r === r.toUpperCase();
      const rank = white ? '1' : '8';
      const king = b[sqIndex(`e${rank}` as Square)];
      const rook = b[sqIndex(`${r.toLowerCase() === 'k' ? 'h' : 'a'}${rank}` as Square)];
      return king === (white ? 'K' : 'k') && rook === (white ? 'R' : 'r');
    })
    .join('');
  return [boardFen(b), parts[1] ?? 'w', rights || '-', '-', parts[4] ?? '0', parts[5] ?? '1'].join(' ');
}

/**
 * Premove destinations: where the piece on `from` could plausibly move once
 * the opponent has replied. Pure geometry from the current position, so
 * sliders ignore blockers and pawns may premove a capture onto any diagonal
 * square, and squares held by your own pieces count. The move is checked for legality only when it is played.
 */
export function premoveDests(fen: string, color: Color, from: Square): Square[] {
  // Premove positions (see applyPremoves) need not be legal, so skip chess.js validation.
  const board = new Chess(fen, { skipValidation: true });
  const piece = board.get(from);
  if (!piece || piece.color !== color) return [];
  const f = from.charCodeAt(0) - 97;
  const r = Number(from[1]) - 1;
  const out: Square[] = [];
  const add = (df: number, dr: number) => {
    const nf = f + df;
    const nr = r + dr;
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) return false;
    out.push(`${String.fromCharCode(97 + nf)}${nr + 1}` as Square);
    return true;
  };
  const ray = (df: number, dr: number) => {
    for (let k = 1; k < 8 && add(df * k, dr * k); k++);
  };
  const STRAIGHT = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const DIAGONAL = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  switch (piece.type) {
    case 'p': {
      const dir = color === 'w' ? 1 : -1;
      add(0, dir);
      if ((color === 'w' && r === 1) || (color === 'b' && r === 6)) add(0, 2 * dir);
      add(1, dir);
      add(-1, dir);
      break;
    }
    case 'n':
      for (const [a, b] of [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ])
        add(a!, b!);
      break;
    case 'b':
      for (const [a, b] of DIAGONAL) ray(a!, b!);
      break;
    case 'r':
      for (const [a, b] of STRAIGHT) ray(a!, b!);
      break;
    case 'q':
      for (const [a, b] of [...STRAIGHT, ...DIAGONAL]) ray(a!, b!);
      break;
    case 'k': {
      for (const [a, b] of [...STRAIGHT, ...DIAGONAL]) add(a!, b!);
      const home = color === 'w' ? 'e1' : 'e8';
      const rights = fen.split(' ')[2] ?? '-';
      if (from === home) {
        if (rights.includes(color === 'w' ? 'K' : 'k')) out.push((color === 'w' ? 'g1' : 'g8') as Square);
        if (rights.includes(color === 'w' ? 'Q' : 'q')) out.push((color === 'w' ? 'c1' : 'c8') as Square);
      }
      break;
    }
  }
  // Squares held by your own pieces stay in: the opponent may capture there
  // first, and recapturing is the most common premove. The enemy king's
  // square is left out: it can never be captured.
  return out.filter((sq) => {
    const p = board.get(sq);
    return !(p && p.type === 'k' && p.color !== color);
  });
}
