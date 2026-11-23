import { PIECE_VALUES, type Color, type PieceType } from './types';

/** Captured-piece types in display order: pawns first, queen last. */
const ORDER: Exclude<PieceType, 'k'>[] = ['p', 'n', 'b', 'r', 'q'];
const START_COUNT: Record<Exclude<PieceType, 'k'>, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

export interface MaterialSide {
  /** Opponent pieces this side has taken, lowest value first (e.g. ['p', 'p', 'n']). */
  captured: Exclude<PieceType, 'k'>[];
  /** Material lead over the opponent in pawns; 0 when level or behind. */
  advantage: number;
}

export type MaterialBalance = Record<Color, MaterialSide>;

/**
 * Captured pieces and material lead for both sides, read from a FEN's board.
 * Promoted pieces are counted as pawns that left the board, so a promotion
 * never shows up as a "captured" pawn. Works for any position, so it follows
 * move-history browsing without needing the move list.
 */
export function materialBalance(fen: string): MaterialBalance {
  const count: Record<Color, Record<PieceType, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const ch of fen.split(' ')[0] ?? '') {
    const type = ch.toLowerCase() as PieceType;
    if (!(type in PIECE_VALUES)) continue;
    count[ch === type ? 'b' : 'w'][type]++;
  }

  /** Pieces of `color` that are no longer on the board. */
  const missing = (color: Color): Exclude<PieceType, 'k'>[] => {
    const c = count[color];
    let promoted = 0;
    for (const t of ORDER) if (t !== 'p') promoted += Math.max(0, c[t] - START_COUNT[t]);
    const out: Exclude<PieceType, 'k'>[] = [];
    for (const t of ORDER) {
      const gone = t === 'p' ? START_COUNT.p - c.p - promoted : START_COUNT[t] - c[t];
      for (let i = 0; i < gone; i++) out.push(t);
    }
    return out;
  };

  const points = (color: Color) => ORDER.reduce((sum, t) => sum + count[color][t] * PIECE_VALUES[t], 0);
  const diff = points('w') - points('b');
  return {
    w: { captured: missing('b'), advantage: Math.max(0, diff) },
    b: { captured: missing('w'), advantage: Math.max(0, -diff) },
  };
}
