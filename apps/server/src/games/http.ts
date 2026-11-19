import { getGame, type Database } from '@chessmate/db';

import type { HttpRoute } from '../social/http';

const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));

/** A finished game as anyone may see it: who played, the moves and the result. */
export interface PublicGame {
  id: string;
  white: { userId: string | null; name: string; ratingBefore: number | null; ratingAfter: number | null };
  black: { userId: string | null; name: string; ratingBefore: number | null; ratingAfter: number | null };
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  initialFen: string;
  /** Moves in UCI ("e2e4"). */
  moves: string[];
  result: string;
  endReason: string | null;
  startedAt: number;
  endedAt: number | null;
}

/**
 * Finished games, for opening them from a profile's recent games:
 *
 *   GET /api/games/:id   → { game: PublicGame }
 *
 * Live and aborted games are not served here (live games are watched over the socket).
 */
export function gameRoutes(db: Database): HttpRoute {
  return async (req, res, url) => {
    const m = /^\/api\/games\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
    if (!m) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'GET') return json(405, { error: 'GET only' });
    try {
      const g = await getGame(db, m[1]!);
      if (!g || g.status !== 'finished') return json(404, { error: 'No such game' });
      const game: PublicGame = {
        id: g.id,
        white: { userId: g.whiteUserId, name: g.whiteName, ratingBefore: round(g.whiteRatingBefore), ratingAfter: round(g.whiteRatingAfter) },
        black: { userId: g.blackUserId, name: g.blackName, ratingBefore: round(g.blackRatingBefore), ratingAfter: round(g.blackRatingAfter) },
        initialMs: g.initialMs,
        incrementMs: g.incrementMs,
        rated: g.rated,
        initialFen: g.initialFen,
        moves: g.moves.map((mv) => mv.uci),
        result: g.result,
        endReason: g.endReason ?? null,
        startedAt: new Date(g.startedAt).getTime(),
        endedAt: g.endedAt ? new Date(g.endedAt).getTime() : null,
      };
      res.setHeader('cache-control', 'public, max-age=300');
      return json(200, { game });
    } catch (e) {
      console.error('game route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
