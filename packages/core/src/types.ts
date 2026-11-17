export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export interface Piece {
  color: Color;
  type: PieceType;
}

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const ALL_SQUARES: Square[] = RANKS.flatMap((r) => FILES.map((f) => `${f}${r}` as Square));

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'timeout'
  | 'timeout_vs_insufficient'
  | 'resignation'
  | 'draw_agreement'
  | 'abandoned'
  | 'aborted';
