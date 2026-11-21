import { hasPermission, type StaffRole } from '@chessmate/core';
import type { IncomingMessage } from 'node:http';

import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { WatchError } from './errors';
import type { EventService } from './events';
import type { StreamerService } from './streamers';
import type { BroadcastSync } from './sync';

async function readJson(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new WatchError(413, 'Request too large');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new WatchError(400, 'Invalid JSON');
  }
}

const ID = '([A-Za-z0-9_-]{1,64})';
const KB = 1024;

type Ctx = { viewer: string | null; me: () => string; params: string[]; body: () => Promise<Record<string, unknown>>; url: URL };
type Handler = (c: Ctx) => Promise<unknown>;

/**
 * Watch: streamers and broadcast events. Reading needs no sign-in; the rest
 * needs an account, and staff or organiser rights where noted in the services.
 */
export function watchRoutes(deps: { streamers: StreamerService; events: EventService; sync?: BroadcastSync; resolveUser: ResolveUser; roleOf: (id: string) => StaffRole }): HttpRoute {
  const { streamers, events, sync } = deps;
  const routes: { method: string; re: RegExp; max: number; run: Handler }[] = [];
  const on = (method: string, pattern: string, run: Handler, max = 64 * KB) => routes.push({ method, re: new RegExp(`^/api/watch${pattern}$`), max, run });

  // Who am I here (which panels to show).
  on('GET', '/me', async ({ viewer }) => ({
    signedIn: !!viewer,
    isAdmin: events.isAdmin(viewer),
    canReviewStreamers: !!viewer && hasPermission(deps.roleOf(viewer), 'streamers.review'),
  }));

  // Streamers
  on('GET', '/streamers', async () => ({ streamers: await streamers.list() }));
  on('GET', '/streamers/me', async ({ me }) => streamers.mine(me()));
  on('POST', '/streamers/apply', async ({ me, body }) => ({ application: await streamers.apply(me(), await body()) }));
  on('POST', '/streamers/me', async ({ me, body }) => ({ streamer: await streamers.updateProfile(me(), await body()) }));
  on('POST', '/streamers/me/live', async ({ me, body }) => ({ streamer: await streamers.goLive(me(), await body()) }));
  on('DELETE', '/streamers/me/live', async ({ me }) => ({ streamer: await streamers.endLive(me()) }));
  on('GET', `/streamers/${ID}`, async ({ params }) => ({ streamer: await streamers.get(params[0]!) }));
  on('DELETE', `/streamers/${ID}`, async ({ me, params, url }) => {
    await streamers.remove(me(), params[0]!, url.searchParams.get('note'));
    return { ok: true };
  });
  on('GET', '/streamer-applications', async ({ me, url }) => ({ applications: await streamers.applications(me(), url.searchParams.get('status') ?? undefined) }));
  on('POST', `/streamer-applications/${ID}`, async ({ me, params, body }) => ({ application: await streamers.review(me(), params[0]!, await body()) }));

  // Events
  on('GET', '/events', async ({ viewer }) => events.list(viewer));
  on('GET', '/events/all', async ({ me }) => ({ events: await events.adminList(me()) }));
  // Event details carry a logo and a cover picture.
  on('POST', '/events', async ({ me, body }) => ({ event: await events.create(me(), await body()) }), 3 * 1024 * KB);
  on('GET', `/events/${ID}`, async ({ viewer, params }) => ({ event: await events.detail(viewer, params[0]!) }));
  on('POST', `/events/${ID}`, async ({ me, params, body }) => ({ event: await events.update(me(), params[0]!, await body()) }), 3 * 1024 * KB);
  on('DELETE', `/events/${ID}`, async ({ me, params }) => {
    await events.remove(me(), params[0]!);
    return { ok: true };
  });
  on('POST', `/events/${ID}/flags`, async ({ me, params, body }) => ({ event: await events.setFlags(me(), params[0]!, await body()) }));
  on('POST', `/events/${ID}/organizers`, async ({ me, params, body }) => ({ event: await events.addOrganizer(me(), params[0]!, (await body()).username) }));
  on('DELETE', `/events/${ID}/organizers/${ID}`, async ({ me, params }) => ({ event: await events.removeOrganizer(me(), params[0]!, params[1]!) }));
  on('POST', `/events/${ID}/players`, async ({ me, params, body }) => ({ event: await events.addPlayer(me(), params[0]!, await body()) }));
  on('POST', `/players/${ID}`, async ({ me, params, body }) => ({ event: await events.updatePlayer(me(), params[0]!, await body()) }));
  on('DELETE', `/players/${ID}`, async ({ me, params }) => ({ event: await events.removePlayer(me(), params[0]!) }));
  on('POST', `/events/${ID}/rounds`, async ({ me, params, body }) => ({ event: await events.addRound(me(), params[0]!, await body()) }));
  on('POST', `/rounds/${ID}`, async ({ me, params, body }) => ({ event: await events.updateRound(me(), params[0]!, await body()) }));
  on('DELETE', `/rounds/${ID}`, async ({ me, params }) => ({ event: await events.removeRound(me(), params[0]!) }));
  on('POST', `/rounds/${ID}/pgn`, async ({ me, params, body }) => ({ result: await events.pastePgn(me(), params[0]!, await body()) }), 4096 * KB);
  on('POST', `/rounds/${ID}/pairings`, async ({ me, params, body }) => ({ event: await events.addPairing(me(), params[0]!, await body()) }));
  on('POST', `/rounds/${ID}/sync`, async ({ me, params }) => {
    const r = await events.resumeSync(me(), params[0]!);
    sync?.wake(r.id);
    return { ok: true };
  });
  on('GET', `/games/${ID}`, async ({ viewer, params }) => ({ game: await events.game(viewer, params[0]!) }));
  on('POST', `/games/${ID}`, async ({ me, params, body }) => ({ event: await events.setResult(me(), params[0]!, (await body()).result) }));
  on('DELETE', `/games/${ID}`, async ({ me, params }) => ({ event: await events.removeGame(me(), params[0]!) }));
  on('POST', `/events/${ID}/news`, async ({ me, params, body }) => ({ event: await events.addNews(me(), params[0]!, await body()) }), 2 * 1024 * KB);
  on('DELETE', `/news/${ID}`, async ({ me, params }) => ({ event: await events.removeNews(me(), params[0]!) }));

  // Applications to broadcast
  on('GET', '/event-applications', async ({ me }) => ({ applications: await events.myApplications(me()) }));
  on('GET', '/event-applications/all', async ({ me, url }) => ({ applications: await events.applications(me(), url.searchParams.get('status') ?? undefined) }));
  on('POST', '/event-applications', async ({ me, body }) => ({ application: await events.apply(me(), await body()) }));
  on('POST', `/event-applications/${ID}`, async ({ me, params, body }) => ({ application: await events.review(me(), params[0]!, await body()) }));

  // Settings
  on('GET', '/settings', async ({ me }) => {
    if (!events.isAdmin(me())) throw new WatchError(403, 'Only ChessMate admins can do that');
    return { settings: await events.settings() };
  });
  on('POST', '/settings', async ({ me, body }) => ({ settings: await events.saveSettings(me(), await body()) }));

  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/watch' && !p.startsWith('/api/watch/')) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
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
      // Logo, cover and news pictures are images, not JSON.
      const pic = req.method === 'GET' ? new RegExp(`^/api/watch/(events|news)/${ID}/(logo|cover|image)$`).exec(p) : null;
      if (pic) {
        const [, kind, id, what] = pic;
        const img = kind === 'news' ? (what === 'image' ? await events.newsImage(id!) : null) : what === 'logo' ? await events.logo(id!) : what === 'cover' ? await events.cover(id!) : null;
        if (!img) return json(404, { error: 'No picture' });
        if (req.headers['if-none-match'] === img.etag) {
          res.writeHead(304).end();
          return true;
        }
        res.writeHead(200, { 'content-type': img.mime, 'cache-control': 'public, max-age=86400', etag: img.etag, 'x-content-type-options': 'nosniff' });
        res.end(img.data);
        return true;
      }
      const route = routes.find((r) => r.method === req.method && r.re.test(p));
      if (!route) return json(404, { error: 'Not found' });
      const params = route.re.exec(p)!.slice(1);
      const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const resolved = token ? await deps.resolveUser(token) : null;
      const viewer = resolved && isAccountId(resolved) ? resolved : null;
      const me = () => {
        if (!viewer) throw new WatchError(401, 'Sign in first');
        return viewer;
      };
      return json(200, await route.run({ viewer, me, params, body: () => readJson(req, route.max), url }));
    } catch (e) {
      if (e instanceof WatchError) return json(e.status, { error: e.message, ...(e.field ? { field: e.field } : {}) });
      console.error('watch request failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
