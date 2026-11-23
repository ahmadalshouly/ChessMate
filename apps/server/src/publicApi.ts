import type { PlayerInfo, TimeCategory, TimeControl } from '@chessmate/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LeaderboardError, type LeaderboardScope, type Leaderboards } from './leaderboard';

/** Live numbers for the home screen. */
export interface ServerStats {
  playersOnline: number;
  gamesInProgress: number;
  playersSeeking: number;
  serverNow: number;
}

/** A live game the Play tab shows as its featured board. Watch it over the socket with `watch`. */
export interface FeaturedGame {
  gameId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  timeControl: TimeControl;
  rated: boolean;
  ply: number;
  /** Current position (public FEN), for a still preview before the board goes live. */
  fen: string;
}

export interface PublicApiDeps {
  leaderboards: Leaderboards;
  stats: () => ServerStats;
  /** A random game in progress, or null when nobody is playing. */
  featured?: () => FeaturedGame | null;
  /** Up to `limit` games in progress for the swipeable live boards. */
  featuredList?: (limit: number) => FeaturedGame[];
  /** Resolves a bearer token to a user id, or null for anonymous viewers. */
  viewerFor: (token: string | null) => string | null;
}

/**
 * Read-only JSON endpoints:
 *   GET /api/stats
 *   GET /api/live/featured   -> { game: FeaturedGame | null }
 *   GET /api/live/games?limit=4 -> { games: FeaturedGame[] }
 *   GET /api/leaderboard?category=blitz&scope=global|country|friends&country=US&limit=50&offset=0
 * Returns true when the request was handled.
 */
export function handlePublicApi(req: IncomingMessage, res: ServerResponse, deps: PublicApiDeps): boolean {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/stats') && !url.pathname.startsWith('/api/leaderboard') && url.pathname !== '/api/live/featured' && url.pathname !== '/api/live/games') return false;

  // Bearer tokens, no cookies, so any origin may read these.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return true;
  }

  if (url.pathname === '/api/stats') {
    res.setHeader('cache-control', 'public, max-age=5');
    json(res, 200, deps.stats());
    return true;
  }

  if (url.pathname === '/api/live/featured') {
    res.setHeader('cache-control', 'no-store');
    json(res, 200, { game: deps.featured?.() ?? null });
    return true;
  }

  if (url.pathname === '/api/live/games') {
    res.setHeader('cache-control', 'no-store');
    json(res, 200, { games: deps.featuredList?.(Number(url.searchParams.get('limit') ?? 4)) ?? [] });
    return true;
  }

  if (url.pathname === '/api/leaderboard') {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const p = url.searchParams;
    deps.leaderboards
      .get({
        category: (p.get('category') ?? 'blitz') as TimeCategory,
        scope: (p.get('scope') ?? 'global') as LeaderboardScope,
        country: p.get('country'),
        viewerId: deps.viewerFor(token),
        limit: p.has('limit') ? Number(p.get('limit')) : undefined,
        offset: p.has('offset') ? Number(p.get('offset')) : undefined,
      })
      .then((page) => {
        res.setHeader('cache-control', 'private, max-age=15');
        json(res, 200, page);
      })
      .catch((e) => {
        if (e instanceof LeaderboardError) return json(res, e.status, { error: e.message });
        console.error('leaderboard query failed', e);
        json(res, 500, { error: 'Leaderboard unavailable' });
      });
    return true;
  }

  json(res, 404, { error: 'Not found' });
  return true;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
