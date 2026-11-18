import type { HttpRoute } from '../auth/http';
import { applyCors, sendJson } from '../auth/http';
import { TournamentError, type TournamentService, type Viewer } from './service';

const STATUS: Record<TournamentError['code'], number> = { not_found: 404, conflict: 409, invalid_input: 400, forbidden: 403, unauthorized: 401 };

/**
 * Tournaments for players. Reading works signed out; joining needs an account.
 *
 *   GET  /api/tournaments              { live, upcoming, finished }
 *   GET  /api/tournaments/:id          standings, pairings and your entry
 *   POST /api/tournaments/:id/join     join, or come back after a break
 *   POST /api/tournaments/:id/leave    before the start: unregister; during: take a break (arena) or withdraw (swiss)
 *
 * Staff create and run tournaments through /api/admin/tournaments.
 */
export function tournamentRoutes(service: TournamentService, viewerOf: (token: string) => Viewer | null, opts: { corsOrigins?: string[] } = {}): HttpRoute {
  const corsOrigins = opts.corsOrigins ?? (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : undefined);
  return async (req, res, url) => {
    if (url.pathname !== '/api/tournaments' && !url.pathname.startsWith('/api/tournaments/')) return false;
    if (applyCors(req, res, corsOrigins)) return true;
    const parts = url.pathname.split('/').filter(Boolean).slice(2).map(decodeURIComponent);
    const auth = req.headers.authorization;
    const viewer = auth?.startsWith('Bearer ') ? viewerOf(auth.slice(7).trim()) : null;
    try {
      const route = `${req.method} ${parts[0] ? ':id' : ''}${parts[1] ? `/${parts[1]}` : ''}`;
      switch (route) {
        case 'GET ':
          sendJson(res, 200, service.list(viewer?.userId ?? null));
          return true;
        case 'GET :id':
          sendJson(res, 200, { tournament: service.detail(parts[0]!, viewer) });
          return true;
        case 'POST :id/join':
        case 'POST :id/leave': {
          if (!viewer) throw new TournamentError('unauthorized', 'Sign in to join tournaments');
          req.resume();
          const t = parts[1] === 'join' ? service.join(viewer, parts[0]!) : service.leave(viewer, parts[0]!);
          sendJson(res, 200, { tournament: t });
          return true;
        }
        default:
          sendJson(res, 404, { error: { code: 'not_found', message: 'No such endpoint' } });
          return true;
      }
    } catch (e) {
      if (e instanceof TournamentError) sendJson(res, STATUS[e.code], { error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } });
      else {
        console.error('[tournaments]', e);
        sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong' } });
      }
      return true;
    }
  };
}
