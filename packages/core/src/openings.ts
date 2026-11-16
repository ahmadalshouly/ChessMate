import { Game, START_FEN } from './game';
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
