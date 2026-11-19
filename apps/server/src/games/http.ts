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

export interface GameRouteDeps {
  /** The signed-in viewer from an access token, or null. */
  viewerOf: (token: string) => string | null;
  /** True when this player keeps their games private (profile privacy setting). */
  gamesHidden: (userId: string) => Promise<boolean>;
}

/**
 * Finished games, for opening them from a profile's recent games:
 *
 *   GET /api/games/:id   → { game: PublicGame }
 *
 * Live and aborted games are not served here (live games are watched over the socket).
 * If either player keeps their games private, only the two players can open it,
 * matching what their profiles show.
 */
export function gameRoutes(db: Database, deps: GameRouteDeps): HttpRoute {
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
      const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const viewer = token ? deps.viewerOf(token) : null;
      const players = [g.whiteUserId, g.blackUserId].filter((x): x is string => !!x);
      if (!viewer || !players.includes(viewer)) {
        for (const id of players) if (await deps.gamesHidden(id)) return json(404, { error: 'No such game' });
      }
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
      res.setHeader('cache-control', 'private, max-age=300');
      return json(200, { game });
    } catch (e) {
      console.error('game route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
