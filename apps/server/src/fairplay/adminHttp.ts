import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FairPlayService } from './service';

/**
 * Review-queue API for moderators, mounted on the game server's HTTP port:
 *
 *   GET  /admin/fairplay/queue?status=open|dismissed|banned
 *   GET  /admin/fairplay/players/:id
 *   POST /admin/fairplay/players/:id/report   { note? }
 *   POST /admin/fairplay/players/:id/dismiss  { note? }
 *   POST /admin/fairplay/players/:id/ban      { reason }
 *   POST /admin/fairplay/players/:id/unban    { note? }
 *
 * Requires `Authorization: Bearer <FAIRPLAY_ADMIN_TOKEN>`. With no token
 * configured the routes do not exist. When moderator accounts land, swap
 * the shared token for a role check on the session.
 */
export function createAdminHandler(service: FairPlayService, adminToken: string | undefined) {
  const expected = adminToken ? Buffer.from(adminToken) : null;
  const authorized = (req: IncomingMessage) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m || !expected) return false;
    const got = Buffer.from(m[1]!);
    return got.length === expected.length && timingSafeEqual(got, expected);
  };

  /** Returns true if the request was an admin route (handled or rejected). */
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/admin/fairplay/') || !expected) return false;
    if (!authorized(req)) return json(res, 401, { error: 'unauthorized' }), true;
    const by = String(req.headers['x-moderator'] ?? 'admin').slice(0, 64);

    if (req.method === 'GET' && url.pathname === '/admin/fairplay/queue') {
      const status = url.searchParams.get('status') ?? 'open';
      if (!['open', 'dismissed', 'banned'].includes(status)) return json(res, 400, { error: 'bad status' }), true;
      return json(res, 200, { cases: service.queue(status as 'open') }), true;
    }
    const m = /^\/admin\/fairplay\/players\/([\w-]{1,64})(?:\/(report|dismiss|ban|unban))?$/.exec(url.pathname);
    if (!m) return json(res, 404, { error: 'not found' }), true;
    const [, id, action] = m as unknown as [string, string, string | undefined];

    if (req.method === 'GET' && !action) return json(res, 200, service.caseFile(id)), true;
    if (req.method !== 'POST' || !action) return json(res, 405, { error: 'method not allowed' }), true;

    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { error: 'invalid json' }), true;
    }
    const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined;
    switch (action) {
      case 'report':
        return json(res, 200, { case: service.report(id, by, note) }), true;
      case 'dismiss': {
        const c = service.dismiss(id, by, note);
        return c ? json(res, 200, { case: c }) : json(res, 409, { error: 'no open case' }), true;
      }
      case 'ban': {
        const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.slice(0, 500) : null;
        if (!reason) return json(res, 400, { error: 'reason required' }), true;
        const ban = service.ban(id, by, reason);
        return ban ? json(res, 200, { ban }) : json(res, 409, { error: 'already banned' }), true;
      }
      case 'unban':
        return service.unban(id, by, note) ? json(res, 200, { ok: true }) : json(res, 409, { error: 'not banned' }), true;
    }
    return false;
  };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      raw += c;
      if (raw.length > 16 * 1024) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const v = raw ? JSON.parse(raw) : {};
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
