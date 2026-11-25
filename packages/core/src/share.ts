import { START_FEN } from './game';
import type { Color, GameResult } from './types';

/**
 * Links for the Share button on every board. Each path is an in-app route and
 * also the web path, so one link opens the app or the web app. Games the
 * server keeps get a short link to that game; anything else (a game against
 * the computer, a practice game, an analysis line) carries its moves in the
 * link, so nothing has to be stored to share it.
 */

/** A path and its query, kept apart so app deep links (exp://, chessmate://) can encode the query their own way. */
export interface AppPath {
  path: string;
  query?: Record<string, string>;
}

const seg = (s: string) => encodeURIComponent(s);

/** A finished online game: the replay, with Review on it. */
export function gamePath(gameId: string): AppPath {
  return { path: `/game/${seg(gameId)}` };
}

/** A finished online game, opening straight on its engine review. */
export function gameReviewPath(gameId: string): AppPath {
  return { path: `/game/${seg(gameId)}`, query: { review: '1' } };
}

/** A live online game, for spectators. */
export function watchPath(gameId: string): AppPath {
  return { path: `/watch/${seg(gameId)}` };
}

/** One game of a broadcast event, live or finished. */
export function broadcastGamePath(gameId: string): AppPath {
  return { path: `/watch/game/${seg(gameId)}` };
}

export interface LinePath {
  /** Moves in UCI ("e2e4"). */
  moves: readonly string[];
  initialFen?: string;
  /** Position to open on, in plies from the start; the end of the line when missing. */
  ply?: number;
}

/** The analysis board on a line of moves (or just a position, with no moves). */
export function analysisPath({ moves, initialFen, ply }: LinePath): AppPath {
  const query: Record<string, string> = {};
  if (initialFen && initialFen !== START_FEN) query.initialFen = initialFen;
  if (moves.length) query.moves = moves.join(',');
  const at = ply === undefined || !Number.isFinite(ply) ? moves.length : Math.max(0, Math.min(moves.length, Math.round(ply)));
  if (at !== moves.length) query.ply = String(at);
  return { path: '/analysis', query };
}

/** Engine review of a line of moves, for a game the server does not keep. */
export function reviewPath(l: LinePath & { white?: string; black?: string; result?: GameResult; orientation?: Color }): AppPath {
  const query: Record<string, string> = {};
  if (l.initialFen && l.initialFen !== START_FEN) query.initialFen = l.initialFen;
  query.moves = l.moves.join(',');
  if (l.white) query.white = l.white;
  if (l.black) query.black = l.black;
  if (l.result && l.result !== '*') query.result = l.result;
  if (l.orientation === 'b') query.orientation = 'b';
  return { path: '/review', query };
}

/** Query string that keeps move lists readable ("moves=e2e4,e7e5"); commas need no escaping in a query. */
export function queryString(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/gi, ',')}`)
    .join('&');
}

/** "/analysis?moves=e2e4,e7e5": the path with its query. */
export function pathWithQuery(p: AppPath): string {
  const qs = p.query ? queryString(p.query) : '';
  return qs ? `${p.path}?${qs}` : p.path;
}
