import { Chess } from 'chess.js';
import type { Color, Square } from './types';

/**
 * Premove destinations: where the piece on `from` could plausibly move once
 * the opponent has replied. Pure geometry from the current position, so
 * sliders ignore blockers and pawns may premove a capture onto any diagonal
 * square, and squares held by your own pieces count. The move is checked for legality only when it is played.
 */
export function premoveDests(fen: string, color: Color, from: Square): Square[] {
  const board = new Chess(fen);
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
  // first, and recapturing is the most common premove.
  return out;
}
