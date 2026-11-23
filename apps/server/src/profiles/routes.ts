import { AVATAR_PHOTO_MAX_BYTES, RATED_CATEGORIES, sniffAvatarPhotoType, validateProfileEdit, type TimeCategory } from '@chessmate/core';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BlobStore } from '../avatars/storage';
import { ProfileService } from './service';
import type { ProfileDeps, ProfileStore } from './types';

/** Same signature the server uses for all HTTP routes: return true when handled. */
export type HttpRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;

const MAX_BODY = 16 * 1024;
/** A photo arrives base64-encoded in JSON: 4/3 of its size, plus a little for the wrapper. */
const MAX_PHOTO_BODY = Math.ceil((AVATAR_PHOTO_MAX_BYTES * 4) / 3) + 1024;
/** Uploads per player per hour. */
const PHOTO_UPLOADS_PER_HOUR = 12;
const PHOTO_PATH = '/api/avatars/';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Where uploaded profile pictures are kept. Without it, the photo endpoints answer 404. */
export interface PhotoOptions {
  blobs: BlobStore;
  /** Told whenever a player's photo changes (database mode mirrors it onto the users row). */
  onChange?(userId: string, url: string | null): void | Promise<void>;
}

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
 *   PUT    /api/me/avatar      { image: base64 JPEG/PNG/WebP }   sets the profile picture
 *   DELETE /api/me/avatar                       removes it
 *   GET    /api/avatars/:file                    the picture itself (immutable, cache forever)
 */
export function profileRoutes(
  deps: ProfileDeps,
  store: ProfileStore,
  now: () => number = Date.now,
  photos?: PhotoOptions,
): HttpRoute & { service: ProfileService } {
  const service = new ProfileService(deps, store, now);
  const uploads = new Map<string, number[]>();

  const route = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    const path = url.pathname;
    if (!path.startsWith('/api/profiles/') && !path.startsWith('/api/me/') && !path.startsWith(PHOTO_PATH)) return false;
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

  /** Storage key of a photo URL this server handed out, or null for anything else. */
  function photoKey(url: string | null | undefined): string | null {
    const m = url ? /^\/api\/avatars\/([a-f0-9]{32}\.(?:jpg|png|webp))$/.exec(url) : null;
    return m ? `avatars/${m[1]}` : null;
  }

  async function dropPhoto(url: string | null) {
    const key = photoKey(url);
    if (key) await photos!.blobs.delete(key).catch((e) => console.warn('could not delete old profile picture', key, e));
  }

  async function handlePhoto(req: IncomingMessage, res: ServerResponse, path: string, m: string) {
    if (!photos) throw new HttpError(404, 'not_found', 'Profile pictures are not available on this server');
    if (path.startsWith(PHOTO_PATH)) {
      if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'method', 'Method not allowed');
      const key = photoKey(path);
      const blob = key ? await photos.blobs.get(key) : null;
      if (!blob) throw new HttpError(404, 'not_found', 'No such picture');
      // The file name is a hash of the contents: a new photo gets a new name, so this one never changes.
      res.writeHead(200, {
        'content-type': blob.contentType,
        'content-length': blob.data.length,
        'cache-control': 'public, max-age=31536000, immutable',
        'cross-origin-resource-policy': 'cross-origin',
        'x-content-type-options': 'nosniff',
      });
      res.end(m === 'HEAD' ? undefined : blob.data);
      return;
    }
    const user = await me(req);
    if (m === 'DELETE') {
      const old = await service.setPhoto(user.id, null);
      await photos.onChange?.(user.id, null);
      await dropPhoto(old);
      return json(res, 200, await service.myProfile(user));
    }
    // PUT and POST both upload.
    const recent = (uploads.get(user.id) ?? []).filter((t) => t > now() - 3_600_000);
    if (recent.length >= PHOTO_UPLOADS_PER_HOUR) throw new HttpError(429, 'rate_limited', 'Too many new pictures. Try again in a while');
    const b = (await body(req, MAX_PHOTO_BODY, res)) as { image?: unknown };
    if (typeof b.image !== 'string' || !b.image) throw new HttpError(400, 'invalid', 'Send the picture as base64 in "image"', 'image');
    const data = Buffer.from(b.image.replace(/^data:[^,]*,/, ''), 'base64');
    if (data.length > AVATAR_PHOTO_MAX_BYTES) throw new HttpError(413, 'too_large', 'That picture is too large');
    const type = sniffAvatarPhotoType(data);
    if (!type) throw new HttpError(400, 'invalid', 'Use a JPEG, PNG or WebP picture', 'image');
    const name = `${createHash('sha256').update(user.id).update(data).digest('hex').slice(0, 32)}.${EXT[type]}`;
    await photos.blobs.put(`avatars/${name}`, data, type);
    uploads.set(user.id, [...recent, now()]);
    const url = `${PHOTO_PATH}${name}`;
    const old = await service.setPhoto(user.id, url);
    await photos.onChange?.(user.id, url);
    if (old !== url) await dropPhoto(old);
    return json(res, 200, await service.myProfile(user));
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL, path: string) {
    const m = req.method ?? 'GET';
    if (path === '/api/me/avatar' || path.startsWith(PHOTO_PATH)) return handlePhoto(req, res, path, m);
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
        const photo = (await service.record(user.id)).avatar.photo ?? null;
        await service.forget(user.id);
        if (photos) await dropPhoto(photo);
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
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-max-age', '600');
}

async function body(req: IncomingMessage, max = MAX_BODY, res?: ServerResponse): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) {
      // The rest of the body is never read: close the connection rather than leave it half-read.
      res?.setHeader('connection', 'close');
      throw new HttpError(413, 'too_large', 'Request too large');
    }
    chunks.push(c as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', 'Malformed JSON');
  }
}
