import { RATED_CATEGORIES, validateProfileEdit, type TimeCategory } from '@chessmate/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProfileService } from './service';
import type { ProfileDeps, ProfileStore } from './types';

/** Same signature the server uses for all HTTP routes: return true when handled. */
export type HttpRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;

const MAX_BODY = 16 * 1024;

/**
 * Profile and settings API.
 *
 *   GET    /api/profiles/:username                       public profile (ratings, W/D/L, recent games)
 *   GET    /api/profiles/:username/rating-history?category=blitz
 *   GET    /api/me/profile                               own profile + email + settings
 *   PATCH  /api/me/profile     { displayName?, bio?, country?, avatar? }
 *   GET    /api/me/settings
 *   PATCH  /api/me/settings    partial settings, e.g. { board: { theme: 'slate' } }
 *   POST   /api/me/password    { currentPassword, newPassword }
 *   POST   /api/me/delete      { password }    permanently deletes the account
 */
export function profileRoutes(deps: ProfileDeps, store: ProfileStore, now: () => number = Date.now): HttpRoute & { service: ProfileService } {
  const service = new ProfileService(deps, store, now);

  const route = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    const path = url.pathname;
    if (!path.startsWith('/api/profiles/') && !path.startsWith('/api/me/')) return false;
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    try {
      await handle(req, res, url, path);
    } catch (e) {
      if (e instanceof HttpError) json(res, e.status, { error: e.code, message: e.message, field: e.field });
      else {
        console.error('profile route failed', e);
        json(res, 500, { error: 'internal', message: 'Something went wrong' });
      }
    }
    return true;
  };

  async function viewer(req: IncomingMessage) {
    const auth = await deps.authenticate(req);
    return auth?.userId ?? null;
  }

  async function me(req: IncomingMessage) {
    const id = await viewer(req);
    const user = id ? await deps.userById(id) : null;
    if (!user) throw new HttpError(401, 'unauthorized', 'Sign in to continue');
    return user;
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL, path: string) {
    const m = req.method ?? 'GET';
    const prof = /^\/api\/profiles\/([A-Za-z0-9_-]{1,32})(\/rating-history)?$/.exec(path);
    if (prof && m === 'GET') {
      const user = await deps.userByUsername(prof[1]!);
      if (!user) throw new HttpError(404, 'not_found', 'No player with that username');
      const viewerId = await viewer(req);
      if (!prof[2]) return json(res, 200, await service.publicProfile(user, viewerId));
      const category = (url.searchParams.get('category') ?? 'blitz') as TimeCategory;
      if (!RATED_CATEGORIES.includes(category)) throw new HttpError(400, 'bad_request', 'Unknown category', 'category');
      const points = await service.ratingHistory(user.id, category, viewerId);
      if (!points) throw new HttpError(403, 'private', 'This player keeps their rating history private');
      return json(res, 200, { category, points });
    }

    switch (`${m} ${path}`) {
      case 'GET /api/me/profile':
        return json(res, 200, await service.myProfile(await me(req)));
      case 'PATCH /api/me/profile': {
        const user = await me(req);
        const v = validateProfileEdit(await body(req));
        if ('error' in v) throw new HttpError(400, 'invalid', v.error, v.field);
        await service.updateProfile(user.id, v.edit);
        return json(res, 200, await service.myProfile(user));
      }
      case 'GET /api/me/settings':
        return json(res, 200, (await service.record((await me(req)).id)).settings);
      case 'PATCH /api/me/settings': {
        const user = await me(req);
        const r = await service.updateSettings(user.id, await body(req));
        if ('error' in r) throw new HttpError(400, 'invalid', r.error);
        return json(res, 200, r.settings);
      }
      case 'POST /api/me/password': {
        const user = await me(req);
        const b = (await body(req)) as { currentPassword?: unknown; newPassword?: unknown };
        // currentPassword may be empty for Google/Apple accounts setting their first password; the account check decides.
        if ((b.currentPassword !== undefined && typeof b.currentPassword !== 'string') || typeof b.newPassword !== 'string') {
          throw new HttpError(400, 'invalid', 'Enter your current and new password');
        }
        const r = await deps.changePassword(user.id, b.currentPassword ?? '', b.newPassword);
        if (!r.ok) throw new HttpError(r.status, 'invalid', r.message, r.field);
        return json(res, 200, { ok: true });
      }
      case 'POST /api/me/delete': {
        const user = await me(req);
        const b = (await body(req)) as { password?: unknown };
        // Accounts with a password must send it; Google/Apple accounts without one send nothing.
        if (b.password !== undefined && typeof b.password !== 'string') throw new HttpError(400, 'invalid', 'Enter your password to confirm', 'password');
        const r = await deps.deleteAccount(user.id, (b.password as string | undefined) ?? '');
        if (!r.ok) throw new HttpError(r.status, 'invalid', r.message, r.field ?? 'password');
        await service.forget(user.id);
        return json(res, 200, { ok: true });
      }
    }
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return Object.assign(route, { service });
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function cors(req: IncomingMessage, res: ServerResponse) {
  // Bearer tokens, no cookies: any origin may call the API.
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('vary', 'origin');
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-max-age', '600');
}

async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'Request too large');
    chunks.push(c as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', 'Malformed JSON');
  }
}
