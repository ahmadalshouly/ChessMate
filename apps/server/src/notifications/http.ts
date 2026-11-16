import { mergeNotificationPrefs } from '@chessmate/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isExpoPushToken } from './push';
import type { NotificationService } from './service';

/** Resolves the bearer token of an HTTP request to a user id, or null. */
export type HttpAuth = (token: string) => string | null;

const MAX_BODY = 8 * 1024;

/**
 * REST API for the notification center, settings and push registration.
 * Returns false when the path is not ours so the caller can keep routing.
 *
 *   GET    /api/notifications?limit=&before=   list + unread count
 *   POST   /api/notifications/read            { ids: string[] } or { all: true }
 *   DELETE /api/notifications/:id
 *   GET    /api/notifications/prefs
 *   PUT    /api/notifications/prefs           partial NotificationPrefs
 *   POST   /api/notifications/test            dev only: sends yourself a sample
 *   POST   /api/push-tokens                   { token, platform }
 *   DELETE /api/push-tokens                   { token }
 */
export async function handleNotificationsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { service: NotificationService; auth: HttpAuth; now: () => number; dev: boolean },
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.startsWith('/api/notifications') && path !== '/api/push-tokens') return false;

  cors(req, res);
  if (req.method === 'OPTIONS') return void res.writeHead(204).end(), true;

  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  const userId = bearer ? ctx.auth(bearer) : null;
  if (!userId) return json(res, 401, { error: 'unauthorized' });

  const { store } = ctx.service;
  const method = req.method ?? 'GET';
  let body: Record<string, unknown> = {};
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    const parsed = await readJson(req);
    if (parsed === undefined) return json(res, 400, { error: 'bad_json' });
    body = parsed;
  }

  if (path === '/api/notifications' && method === 'GET') {
    const limit = clamp(Number(url.searchParams.get('limit') ?? 50), 1, 100);
    const beforeRaw = url.searchParams.get('before');
    const before = beforeRaw ? Number(beforeRaw) : undefined;
    return json(res, 200, { notifications: store.list(userId, { limit, before: Number.isFinite(before) ? before : undefined }), unread: store.unreadCount(userId) });
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    const ids = body.all === true ? 'all' : Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : null;
    if (!ids) return json(res, 400, { error: 'ids or all required' });
    store.markRead(userId, ids, ctx.now());
    return json(res, 200, { unread: store.unreadCount(userId) });
  }
  if (path === '/api/notifications/prefs') {
    if (method === 'GET') return json(res, 200, store.prefs(userId));
    if (method === 'PUT') {
      const next = mergeNotificationPrefs(store.prefs(userId), body);
      store.savePrefs(userId, next);
      return json(res, 200, next);
    }
  }
  if (path === '/api/notifications/test' && method === 'POST' && ctx.dev) {
    const n = ctx.service.notify(userId, {
      kind: 'system',
      title: 'Test notification',
      body: 'Notifications are working on this device.',
      url: '/notifications',
    });
    return json(res, 200, { notification: n });
  }
  const one = /^\/api\/notifications\/([\w-]{1,64})$/.exec(path);
  if (one && method === 'DELETE') {
    const ok = store.remove(userId, one[1]!);
    return json(res, ok ? 200 : 404, { unread: store.unreadCount(userId) });
  }
  if (path === '/api/push-tokens') {
    if (!isExpoPushToken(body.token)) return json(res, 400, { error: 'invalid push token' });
    if (method === 'POST') {
      const platform = typeof body.platform === 'string' ? body.platform.slice(0, 16) : 'unknown';
      store.addPushToken({ token: body.token, userId, platform, updatedAt: ctx.now() });
      return json(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      store.removePushToken(body.token, userId);
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'not_found' });
}

function cors(req: IncomingMessage, res: ServerResponse) {
  // Bearer tokens, not cookies, so any origin may call the API.
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('vary', 'origin');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-max-age', '600');
}

function json(res: ServerResponse, status: number, data: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
  return true;
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : hi);

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(undefined);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const v = JSON.parse(raw) as unknown;
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}
