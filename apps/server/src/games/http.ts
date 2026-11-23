import { getGame, getReviewForGame, headToHead, reviewAccuracies, saveReviewForGame, type Database } from '@chessmate/db';

import { readJson } from '../auth/http';
import type { HttpRoute } from '../social/http';
import { reviewFromUpload } from './reviewUpload';

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
  /** Accuracy per side once the game has a saved review, else null. */
  accuracy: { w: number; b: number } | null;
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
 *   GET  /api/games/:id           → { game: PublicGame }
 *   GET  /api/games/:id/review    → { review: GameReview }  the saved review (signed in), 404 when none yet
 *   POST /api/games/:id/review    { evals } → { review }    save the review graded on a player's device
 *   GET  /api/games/h2h/:userId   → { h2h: HeadToHead }  your record against that player (signed in)
 *
 * Reviews are graded on players' devices; the server runs no engine for them.
 * The first review saved for a game is the one everyone sees. Only the two
 * players can save it (anyone signed in can read it), so nobody can attach a
 * review to someone else's game; other viewers grade it on their own device
 * without saving until one of the players reviews it.
 *
 * Live and aborted games are not served here (live games are watched over the socket).
 * If either player keeps their games private, only the two players can open it,
 * matching what their profiles show.
 */
export function gameRoutes(db: Database, deps: GameRouteDeps): HttpRoute {
  return async (req, res, url) => {
    const m = /^\/api\/games\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
    const vs = /^\/api\/games\/h2h\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
    const rv = /^\/api\/games\/([A-Za-z0-9_-]{1,64})\/review$/.exec(url.pathname);
    if (!m && !vs && !rv) return false;
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
    if (req.method !== 'GET' && !(rv && req.method === 'POST')) return json(405, { error: 'GET only' });
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const viewer = token ? deps.viewerOf(token) : null;
    if (vs) {
      // Your own games against them: no privacy question, but you must be signed in.
      if (!viewer) return json(401, { error: 'Sign in again' });
      try {
        res.setHeader('cache-control', 'no-store');
        return json(200, { h2h: await headToHead(db, viewer, vs[1]!) });
      } catch {
        return json(500, { error: 'Could not load your games against this player' });
      }
    }
    try {
      const g = await getGame(db, (m ?? rv)![1]!);
      if (!g || g.status !== 'finished') return json(404, { error: 'No such game' });
      const players = [g.whiteUserId, g.blackUserId].filter((x): x is string => !!x);
      if (!viewer || !players.includes(viewer)) {
        for (const id of players) if (await deps.gamesHidden(id)) return json(404, { error: 'No such game' });
      }
      if (rv) {
        // Game review is for signed-in players.
        res.setHeader('cache-control', 'no-store');
        if (!viewer) return json(401, { error: 'Sign in to review games' });
        if (req.method === 'GET') {
          const review = await getReviewForGame(db, g.id);
          return review ? json(200, { review }) : json(404, { error: 'Not reviewed yet' });
        }
        if (!players.includes(viewer)) return json(403, { error: 'Only the players can save the review of this game' });
        const saved = await getReviewForGame(db, g.id);
        if (saved) return json(200, { review: saved });
        let body: Record<string, unknown>;
        try {
          body = await readJson(req, 1024 * 1024);
        } catch (e) {
          return json(400, { error: e instanceof Error ? e.message : 'Invalid body' });
        }
        const built = reviewFromUpload(g.initialFen, g.moves.map((mv) => mv.uci), body.evals);
        if ('error' in built) return json(400, { error: built.error });
        return json(200, { review: await saveReviewForGame(db, g.id, built.review) });
      }
      const accuracy = (await reviewAccuracies(db, [g.id])).get(g.id) ?? null;
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
        accuracy,
      };
      // Short: a review saved after the first visit should show up soon.
      res.setHeader('cache-control', 'private, max-age=30');
      return json(200, { game });
    } catch (e) {
      console.error('game route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
