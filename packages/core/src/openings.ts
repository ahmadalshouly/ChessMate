import { Game, START_FEN } from './game';
import { BOOK_DATA } from './book-data';
import { OPENINGS_DATA } from './openings-data';

export interface Opening {
  /** ECO code, e.g. "B90". */
  eco: string;
  /** Full name, e.g. "Sicilian Defense: Najdorf Variation". */
  name: string;
  /** Ply (half-move count) at which the position was last recognised. */
  ply: number;
}

let table: Map<string, { eco: string; name: string }> | null = null;

/** Builds the position index lazily so apps only pay for it when used. */
function openings(): Map<string, { eco: string; name: string }> {
  if (table) return table;
  table = new Map();
  for (const line of OPENINGS_DATA.split('\n')) {
    const a = line.indexOf('|');
    const b = line.indexOf('|', a + 1);
    table.set(line.slice(0, a), { eco: line.slice(a + 1, b), name: line.slice(b + 1) });
  }
  return table;
}

/** Position key used for lookup: FEN without the move counters. */
export function openingKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** Opening named for exactly this position, if any. */
export function lookupOpening(fen: string): { eco: string; name: string } | null {
  return openings().get(openingKey(fen)) ?? null;
}

/** "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
export function openingFamily(name: string): string {
  return name.split(':')[0]!.trim();
}

/**
 * Opening in effect after each ply: entry i is the deepest named position
 * reached in the first i plies (index 0 is the start position). Transpositions
 * are recognised because lookup is by position, not move order.
 * Games from a custom start position have no opening.
 */
export function openingTimeline(moves: string[], initialFen: string = START_FEN): (Opening | null)[] {
  const out: (Opening | null)[] = [null];
  if (openingKey(initialFen) !== openingKey(START_FEN)) return [null, ...moves.map(() => null)];
  const g = new Game(initialFen);
  let current: Opening | null = null;
  for (const m of moves) {
    if (!g.move(m)) break;
    const hit = lookupOpening(g.fen);
    if (hit) current = { ...hit, ply: g.ply };
    out.push(current);
  }
  return out;
}

/** Deepest named opening reached by a game. */
export function detectOpening(moves: string[], initialFen: string = START_FEN): Opening | null {
  const t = openingTimeline(moves, initialFen);
  return t[t.length - 1] ?? null;
}

/* ---------- opening book ---------- */

let book: Set<number> | null = null;

/** 32-bit FNV-1a, the hash scripts/build-openings.mjs stores book positions under. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function bookPositions(): Set<number> {
  if (book) return book;
  book = new Set(BOOK_DATA.split(' ').map((h) => parseInt(h, 36)));
  return book;
}

/**
 * True when the position lies on a known opening line: a named opening or any
 * position on the way to one. Only reliable for positions reached from book
 * positions, which is how `bookTimeline` uses it.
 */
export function isBookPosition(fen: string): boolean {
  return bookPositions().has(fnv1a(openingKey(fen)));
}

/**
 * Whether each move of a game is still theory: entry i is true when the
 * position after move i+1 is a book position and every earlier move was too.
 * Once a game leaves the book it never comes back, so a later transposition
 * into a known position is not theory. Games from a custom start have none.
 */
export function bookTimeline(moves: string[], initialFen: string = START_FEN): boolean[] {
  const out = moves.map(() => false);
  if (openingKey(initialFen) !== openingKey(START_FEN)) return out;
  const g = new Game(initialFen);
  for (let i = 0; i < moves.length; i++) {
    if (!g.move(moves[i]!) || !isBookPosition(g.fen)) break;
    out[i] = true;
  }
  return out;
}
