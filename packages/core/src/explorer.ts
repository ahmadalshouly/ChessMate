import { Game, START_FEN, toUci } from './game';
import { lookupOpening, openingKey } from './openings';

/**
 * Dig Deep, the opening explorer: for a position, the moves played from it
 * and how the games went. Three game collections:
 *
 * - `lichess`: rated games on Lichess (billions), with speed and rating filters.
 * - `masters`: over-the-board games of players rated 2200 and up (Lichess's masters database).
 * - `chessmate`: games played on ChessMate, counted by our own server.
 *
 * The ChessMate server fetches the first two from the Lichess opening
 * explorer and caches them, so the app only ever talks to our server.
 */
export type ExplorerSource = 'lichess' | 'masters' | 'chessmate';
export const EXPLORER_SOURCES: ExplorerSource[] = ['lichess', 'masters', 'chessmate'];

/** Game speeds the Lichess database can be filtered by. */
export type ExplorerSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical';
export const EXPLORER_SPEEDS: ExplorerSpeed[] = ['bullet', 'blitz', 'rapid', 'classical'];

/**
 * Rating groups of the Lichess database: a game is in the group of its
 * players' average rating, 1600 meaning 1600 to 1799 and so on (2500 and up
 * for the last one).
 */
export const EXPLORER_RATINGS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;
export type ExplorerRating = (typeof EXPLORER_RATINGS)[number];

export interface ExplorerFilters {
  /** Lichess only. Empty or absent: every speed. */
  speeds?: ExplorerSpeed[];
  /** Lichess only. Empty or absent: every rating group. */
  ratings?: ExplorerRating[];
}

/** Default Lichess filter: the usual online speeds, club players and up. */
export const DEFAULT_EXPLORER_FILTERS: Required<ExplorerFilters> = {
  speeds: ['blitz', 'rapid', 'classical'],
  ratings: [1600, 1800, 2000, 2200, 2500],
};

export interface ExplorerCounts {
  white: number;
  draws: number;
  black: number;
}

export interface ExplorerMove extends ExplorerCounts {
  uci: string;
  san: string;
  /** Average rating of the players who chose it, when the database has one. */
  averageRating: number | null;
}

export interface ExplorerPosition extends ExplorerCounts {
  source: ExplorerSource;
  /** The position, as FEN without move counters. */
  key: string;
  /** Most played first. */
  moves: ExplorerMove[];
  /** Named opening of this position, if it has one. */
  opening: { eco: string; name: string } | null;
}

/** Moves the explorer lists for one position. */
export const EXPLORER_MAX_MOVES = 16;
/**
 * ChessMate games are counted for their first this-many plies only: theory
 * rarely runs longer, and it bounds what one game writes.
 */
export const EXPLORER_MAX_PLY = 30;

export function explorerTotal(c: ExplorerCounts): number {
  return c.white + c.draws + c.black;
}

/**
 * Win, draw and loss shares in whole percent that add up to 100 (largest
 * remainders get the rounding), for the result bar. All zero for no games.
 */
export function explorerShares(c: ExplorerCounts): ExplorerCounts {
  const total = explorerTotal(c);
  if (!total) return { white: 0, draws: 0, black: 0 };
  const keys = ['white', 'draws', 'black'] as const;
  const raw = keys.map((k) => (c[k] * 100) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return { white: out[0]!, draws: out[1]!, black: out[2]! };
}

/** Share of the position's games that went on with this move, 0 to 100. */
export function movePlayedShare(position: ExplorerCounts & { moves: ExplorerCounts[] }, move: ExplorerCounts): number {
  const total = Math.max(explorerTotal(position), position.moves.reduce((n, m) => n + explorerTotal(m), 0));
  return total ? (explorerTotal(move) * 100) / total : 0;
}

/** Score for White over these games, 0 to 1 (a draw is half). Null for no games. */
export function explorerWhiteScore(c: ExplorerCounts): number | null {
  const total = explorerTotal(c);
  return total ? (c.white + c.draws / 2) / total : null;
}

/** "812", "4.4K", "19.9M", "185M", "1.2B": short game counts for narrow columns. */
export function formatGameCount(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)));
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size;
      // One decimal below 100 ("19.9M"), none from there ("185M").
      const text = v >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
      // 999.96K rounds up to "1000K": say "1M" instead.
      if (text === '1000' && unit !== 'B') return `1${unit === 'K' ? 'M' : 'B'}`;
      return `${text}${unit}`;
    }
  }
  return String(n);
}

/** The explorer's position key: FEN without the move counters, so move numbers don't split positions. */
export function explorerKey(fen: string): string {
  return openingKey(new Game(fen).fen);
}

/** Speeds and rating groups in a fixed order without repeats or unknown values. */
export function normalizeExplorerFilters(f: ExplorerFilters | undefined): Required<ExplorerFilters> {
  const speeds = EXPLORER_SPEEDS.filter((s) => f?.speeds?.includes(s));
  const ratings = EXPLORER_RATINGS.filter((r) => f?.ratings?.includes(r));
  return { speeds, ratings };
}

/** Parses "blitz,rapid" and "1600,1800" from a query string. */
export function parseExplorerFilters(speeds: string | null | undefined, ratings: string | null | undefined): Required<ExplorerFilters> {
  return normalizeExplorerFilters({
    speeds: (speeds ?? '').split(',').filter(Boolean) as ExplorerSpeed[],
    ratings: (ratings ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number) as ExplorerRating[],
  });
}

/** Cache key for one position in one collection (with its filters for Lichess). */
export function explorerCacheKey(source: ExplorerSource, fen: string, filters?: ExplorerFilters): string {
  const key = explorerKey(fen);
  if (source !== 'lichess') return `${source}|${key}`;
  const f = normalizeExplorerFilters(filters);
  return `lichess|${key}|${f.speeds.join(',')}|${f.ratings.join(',')}`;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

/**
 * Reads a Lichess opening explorer answer (/lichess or /masters) for `fen`.
 * Each move is checked against the position and named by our own SAN and UCI
 * (Lichess may write castling as the king taking its rook). Moves that are
 * not legal here are dropped. Returns null when the answer isn't one.
 */
export function parseLichessExplorer(fen: string, source: 'lichess' | 'masters', json: unknown): ExplorerPosition | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.moves)) return null;
  let game: Game;
  try {
    game = new Game(fen);
  } catch {
    return null;
  }
  const legal = game.legalMoves();
  const bySan = new Map(legal.map((m) => [m.san, m]));
  const byUci = new Map(legal.map((m) => [toUci(m), m]));
  const moves: ExplorerMove[] = [];
  const seen = new Set<string>();
  for (const raw of o.moves as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const hit = (typeof m.san === 'string' ? bySan.get(m.san) : undefined) ?? (typeof m.uci === 'string' ? byUci.get(m.uci) : undefined);
    if (!hit) continue;
    const uci = toUci(hit);
    if (seen.has(uci)) continue;
    seen.add(uci);
    const avg = m.averageRating;
    moves.push({
      uci,
      san: hit.san,
      white: count(m.white),
      draws: count(m.draws),
      black: count(m.black),
      averageRating: typeof avg === 'number' && Number.isFinite(avg) && avg > 0 ? Math.round(avg) : null,
    });
  }
  moves.sort((a, b) => explorerTotal(b) - explorerTotal(a));
  const key = openingKey(game.fen);
  const op = o.opening as Record<string, unknown> | null | undefined;
  const opening =
    op && typeof op.eco === 'string' && typeof op.name === 'string' ? { eco: op.eco, name: op.name } : lookupOpening(game.fen);
  return {
    source,
    key,
    white: count(o.white),
    draws: count(o.draws),
    black: count(o.black),
    moves: moves.slice(0, EXPLORER_MAX_MOVES),
    opening,
  };
}

/* ---------- theory ("Book" in game review) ---------- */

/**
 * A move counts as theory when masters chose it in at least this many games
 * from the position, and in at least this share of the games there. The two
 * together keep one-off tries and rare sidelines out, while every main line
 * and serious alternative stays in.
 */
export const THEORY_RULE = { minGames: 10, minShare: 0.01 } as const;

/** True when the database says this move is theory in this position. */
export function isTheoryMove(position: ExplorerPosition, uci: string): boolean {
  const m = position.moves.find((x) => x.uci === uci);
  if (!m) return false;
  const games = explorerTotal(m);
  const all = Math.max(explorerTotal(position), position.moves.reduce((n, x) => n + explorerTotal(x), 0));
  return games >= THEORY_RULE.minGames && all > 0 && games / all >= THEORY_RULE.minShare;
}

/**
 * How many opening moves of a game are theory: walks the game while each
 * move is a theory move in the position before it. `positionAt(i)` gives the
 * database's view of the position before move i (null when unknown, which
 * ends the walk). Games from a custom start have no theory.
 */
export async function theoryPlies(
  moves: string[],
  positionAt: (fen: string, ply: number) => Promise<ExplorerPosition | null>,
  initialFen: string = START_FEN,
  maxPlies: number = EXPLORER_MAX_PLY,
): Promise<number> {
  if (openingKey(new Game(initialFen).fen) !== openingKey(START_FEN)) return 0;
  const g = new Game(initialFen);
  let n = 0;
  for (const uci of moves.slice(0, maxPlies)) {
    const pos = await positionAt(g.fen, n);
    if (!pos || !isTheoryMove(pos, uci)) break;
    if (!g.move(uci)) break;
    n++;
  }
  return n;
}

/* ---------- ChessMate's own games ---------- */

/** One counted move of a finished ChessMate game. */
export interface ExplorerTally {
  /** Position before the move, as FEN without move counters. */
  key: string;
  uci: string;
  san: string;
}

/**
 * The moves of a game that go into the ChessMate explorer: its first
 * EXPLORER_MAX_PLY moves, from the standard start only. Empty for games from
 * a custom position or with a move that isn't legal.
 */
export function explorerTallies(moves: string[], initialFen: string = START_FEN): ExplorerTally[] {
  let g: Game;
  try {
    g = new Game(initialFen);
  } catch {
    return [];
  }
  if (openingKey(g.fen) !== openingKey(START_FEN)) return [];
  const out: ExplorerTally[] = [];
  for (const uci of moves.slice(0, EXPLORER_MAX_PLY)) {
    const key = openingKey(g.fen);
    const played = g.move(uci);
    if (!played) return [];
    out.push({ key, uci: played.uci, san: played.san });
  }
  return out;
}
