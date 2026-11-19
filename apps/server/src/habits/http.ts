import type { IncomingMessage } from 'node:http';

import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { HabitsError, type PlayHabitsService } from './service';

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) {
    raw += String(c);
    if (raw.length > 4096) throw new HabitsError(400, 'Body too large');
  }
  try {
    const v = JSON.parse(raw || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new HabitsError(400, 'Invalid JSON');
  }
}

/**
 * The signed-in player's play limit and streak.
 *
 *   GET  /api/me/habits?tz=60          { habits }  (tz: minutes east of UTC)
 *   POST /api/me/habits                { enabled?, maxGames?, windowMinutes?, cooldownMinutes? } → { habits }
 *   POST /api/me/habits/computer-game  { plies } → { habits, lockedNow }  a finished game against the computer
 */
export function habitsRoutes(habits: PlayHabitsService, resolveUser: ResolveUser, onLock?: (userId: string, until: number) => void): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/me/habits' && p !== '/api/me/habits/computer-game') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
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
    try {
      const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const viewer = token ? await resolveUser(token) : null;
      if (!viewer || !isAccountId(viewer)) return json(401, { error: 'Sign in to use play limits and streaks' });
      if (p === '/api/me/habits' && req.method === 'GET') {
        const tz = url.searchParams.has('tz') ? Number(url.searchParams.get('tz')) : undefined;
        return json(200, { habits: await habits.view(viewer, tz) });
      }
      if (p === '/api/me/habits' && req.method === 'POST') return json(200, { habits: await habits.update(viewer, await readJson(req)) });
      if (p === '/api/me/habits/computer-game' && req.method === 'POST') {
        const r = await habits.computerGame(viewer, Number((await readJson(req)).plies));
        if (r.lockedNow && r.view.lockedUntil) onLock?.(viewer, r.view.lockedUntil);
        return json(200, { habits: r.view, lockedNow: r.lockedNow });
      }
      return json(405, { error: 'Method not allowed' });
    } catch (e) {
      if (e instanceof HabitsError) return json(e.status, { error: e.message });
      console.error('habits request failed', e);
      return json(500, { error: 'Something went wrong. Try again.' });
    }
  };
}
