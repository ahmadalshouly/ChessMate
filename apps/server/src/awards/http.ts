import { findUserByUsername, getUser } from '@chessmate/db';

import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import type { AwardsService } from './service';

/**
 * Awards of a player (public, like their profile).
 *
 *   GET /api/awards              the signed-in player's awards
 *   GET /api/awards?user=<id|username>
 */
export function awardsRoutes(awards: AwardsService, resolveUser: ResolveUser): HttpRoute {
  const db = awards.db;
  return async (req, res, url) => {
    if (url.pathname !== '/api/awards') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
    try {
      const asked = url.searchParams.get('user')?.trim();
      let userId: string | null = null;
      if (asked) {
        if (db) userId = (await getUser(db, asked))?.id ?? (await findUserByUsername(db, asked))?.id ?? null;
        else if (isAccountId(asked)) userId = asked;
        if (!userId) return json(404, { error: 'Player not found' });
      } else {
        const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
        const viewer = token ? await resolveUser(token) : null;
        if (!viewer || !isAccountId(viewer)) return json(401, { error: 'Sign in to see your awards' });
        userId = viewer;
      }
      return json(200, { awards: await awards.view(userId) });
    } catch (e) {
      console.error('awards request failed', e);
      return json(500, { error: 'Could not load awards' });
    }
  };
}
