import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { TournamentError, type TournamentService } from './service';

/**
 * Tournaments for players. Reading needs no sign-in; joining needs an account.
 *
 *   GET  /api/tournaments             list (running, upcoming, then past)
 *   GET  /api/tournaments/:id         details and standings
 *   POST /api/tournaments/:id/join
 *   POST /api/tournaments/:id/withdraw
 */
export function tournamentRoutes(tournaments: TournamentService, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    if (url.pathname !== '/api/tournaments' && !url.pathname.startsWith('/api/tournaments/')) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    try {
      const auth = req.headers.authorization;
      const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const viewer = token ? await resolveUser(token) : null;
      const parts = url.pathname.split('/').filter(Boolean).slice(2);
      const [id, action] = parts;
      if (req.method === 'GET' && !id) return json(200, { tournaments: tournaments.list(viewer) });
      if (req.method === 'GET' && id && !action) return json(200, { tournament: tournaments.detail(viewer, id) });
      if (req.method === 'POST' && id && (action === 'join' || action === 'withdraw')) {
        if (!viewer) return json(401, { error: 'Sign in to join tournaments' });
        if (!isAccountId(viewer)) return json(403, { error: 'Create an account to join tournaments' });
        return json(200, { tournament: action === 'join' ? await tournaments.join(viewer, id) : tournaments.withdraw(viewer, id) });
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof TournamentError) return json(e.status, { error: e.message });
      console.error('tournament route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
