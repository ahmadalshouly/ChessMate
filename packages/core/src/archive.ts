import { START_FEN } from './game';
import { detectOpening, openingFamily } from './openings';
import { timeCategory, type TimeCategory, type TimeControl } from './timeControl';
import type { Color, GameEndReason, GameResult } from './types';

/** Where an archived game came from. */
export type GameSource = 'online' | 'practice' | 'import';

/**
 * A finished game as stored in the archive (on device or from the server).
 * Moves are UCI so they replay with `Game.fromUciMoves`.
 */
export interface ArchivedGame {
  id: string;
  source: GameSource;
  white: string;
  black: string;
  whiteRating: number | null;
  blackRating: number | null;
  /** Rating change from this game, when it was rated. */
  whiteDelta: number | null;
  blackDelta: number | null;
  /** Side the viewer played; null for imports and pass-and-play games. */
  myColor: Color | null;
  timeControl: TimeControl | null;
  category: TimeCategory | null;
  rated: boolean;
  result: GameResult;
  reason: GameEndReason | null;
  initialFen: string;
  moves: string[];
  startedAt: number;
  endedAt: number;
  eco: string | null;
  opening: string | null;
  /** Extra PGN tags kept from imports (Event, Site, Round, ...). */
  tags?: Record<string, string>;
  /** The mover's clock after each ply (ms), null where unknown; written as [%clk] in the PGN. */
  clocks?: (number | null)[];
}

/** Fills in opening and category for a game missing them. */
export function withDerivedFields(g: ArchivedGame): ArchivedGame {
  const opening = g.opening ? null : detectOpening(g.moves, g.initialFen);
  return {
    ...g,
    eco: g.eco ?? opening?.eco ?? null,
    opening: g.opening ?? opening?.name ?? null,
    category: g.category ?? (g.timeControl ? timeCategory(g.timeControl) : null),
  };
}

/** Game record shape stored by the server's accounts database. */
export interface ServerGameRecord {
  id: string;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  whiteDelta: number | null;
  blackDelta: number | null;
  initialMs: number;
  incrementMs: number;
  category: TimeCategory;
  rated: boolean;
  result: GameResult;
  reason: GameEndReason;
  initialFen: string;
  moves: string[];
  startedAt: number;
  endedAt: number;
}

/** Converts a server game record to an archive entry seen from `viewerId`. */
export function fromServerRecord(r: ServerGameRecord, viewerId?: string): ArchivedGame {
  return withDerivedFields({
    id: r.id,
    source: 'online',
    white: r.whiteName,
    black: r.blackName,
    whiteRating: r.whiteRating,
    blackRating: r.blackRating,
    whiteDelta: r.whiteDelta,
    blackDelta: r.blackDelta,
    myColor: viewerId === r.whiteId ? 'w' : viewerId === r.blackId ? 'b' : null,
    timeControl: { initialMs: r.initialMs, incrementMs: r.incrementMs },
    category: r.category,
    rated: r.rated,
    result: r.result,
    reason: r.reason,
    initialFen: r.initialFen || START_FEN,
    moves: r.moves,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    eco: null,
    opening: null,
  });
}

export type ViewerOutcome = 'win' | 'loss' | 'draw';

/** Result from the viewer's side, or null when they did not play / game unfinished. */
export function viewerOutcome(g: Pick<ArchivedGame, 'myColor' | 'result'>): ViewerOutcome | null {
  if (g.result === '1/2-1/2') return 'draw';
  if (!g.myColor || g.result === '*') return null;
  const whiteWon = g.result === '1-0';
  return whiteWon === (g.myColor === 'w') ? 'win' : 'loss';
}

export interface GameFilter {
  outcome?: ViewerOutcome;
  color?: Color;
  category?: TimeCategory;
  source?: GameSource;
  rated?: boolean;
  /** Opening family, e.g. "Sicilian Defense". */
  openingFamily?: string;
  /** Free text matched against player names, opening name and ECO. */
  query?: string;
  /** Inclusive range on `endedAt` (ms since epoch). */
  since?: number;
  until?: number;
}

export function matchesFilter(g: ArchivedGame, f: GameFilter): boolean {
  if (f.outcome && viewerOutcome(g) !== f.outcome) return false;
  if (f.color && g.myColor !== f.color) return false;
  if (f.category && g.category !== f.category) return false;
  if (f.source && g.source !== f.source) return false;
  if (f.rated !== undefined && g.rated !== f.rated) return false;
  if (f.openingFamily && (!g.opening || openingFamily(g.opening) !== f.openingFamily)) return false;
  if (f.since !== undefined && g.endedAt < f.since) return false;
  if (f.until !== undefined && g.endedAt > f.until) return false;
  const q = f.query?.trim().toLowerCase();
  if (q) {
    const hay = [g.white, g.black, g.opening ?? '', g.eco ?? ''].join(' ').toLowerCase();
    if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

/** Filters and sorts newest first. */
export function filterGames(games: readonly ArchivedGame[], f: GameFilter = {}): ArchivedGame[] {
  return games.filter((g) => matchesFilter(g, f)).sort((a, b) => b.endedAt - a.endedAt);
}

export interface ArchiveStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
}

export function archiveStats(games: readonly ArchivedGame[]): ArchiveStats {
  const s: ArchiveStats = { total: games.length, wins: 0, losses: 0, draws: 0 };
  for (const g of games) {
    const o = viewerOutcome(g);
    if (o === 'win') s.wins++;
    else if (o === 'loss') s.losses++;
    else if (o === 'draw') s.draws++;
  }
  return s;
}

/** Opening families present in a set of games, most played first. */
export function openingFamilies(games: readonly ArchivedGame[]): { family: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of games) if (g.opening) counts.set(openingFamily(g.opening), (counts.get(openingFamily(g.opening)) ?? 0) + 1);
  return [...counts].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

/** Opponent name from the viewer's side, or "White vs Black" when not a participant. */
export function opponentOf(g: ArchivedGame): string | null {
  if (g.myColor === 'w') return g.black;
  if (g.myColor === 'b') return g.white;
  return null;
}
