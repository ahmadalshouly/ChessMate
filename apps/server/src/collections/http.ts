import type { AppPath } from '@chessmate/core';
import type { IncomingMessage } from 'node:http';

import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { CollectionsError, type CollectionsService } from './service';

const MAX_BODY = 32 * 1024;
const ID = '([A-Za-z0-9_-]{1,64})';
const ONE = new RegExp(`^/api/collections/${ID}$`);
const ITEMS = new RegExp(`^/api/collections/${ID}/items$`);
const ITEM = new RegExp(`^/api/collections/${ID}/items/${ID}$`);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) {
    raw += String(c);
    if (raw.length > MAX_BODY) throw new CollectionsError(413, 'Body too large');
  }
  try {
    const v = JSON.parse(raw || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new CollectionsError(400, 'Invalid JSON');
  }
}

/** `?link=/analysis?moves=e2e4` back into a path and query. */
function linkParam(raw: string | null): AppPath | undefined {
  if (!raw) return undefined;
  const u = new URL(raw, 'http://x');
  const query = Object.fromEntries(u.searchParams);
  return Object.keys(query).length ? { path: u.pathname, query } : { path: u.pathname };
}

/**
 * Game collections. Reading a player's shown collections needs no sign-in;
 * everything else is for the signed-in owner.
 *
 *   GET    /api/collections                       your collections   (?link=<path?query> marks the ones holding that game)
 *   GET    /api/collections?user=<id|username>    a player's collections (only shown ones, unless they are yours)
 *   POST   /api/collections                       { name, description?, isPublic?, item? } → { collection }
 *   GET    /api/collections/:id                   { collection } with its games
 *   PATCH  /api/collections/:id                   { name?, description?, isPublic? } → { collection }
 *   DELETE /api/collections/:id
 *   POST   /api/collections/:id/items             { title, link, pgn? } → { item, added }
 *   DELETE /api/collections/:id/items             { link }  removes the game with that link
 *   DELETE /api/collections/:id/items/:itemId
 */
export function collectionsRoutes(collections: CollectionsService, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/collections' && !p.startsWith('/api/collections/')) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
      const resolved = token ? await resolveUser(token) : null;
      const viewer = resolved && isAccountId(resolved) ? resolved : null;
      const signedIn = () => {
        if (!viewer) throw new CollectionsError(401, 'Sign in to keep game collections');
        return viewer;
      };
      const m = req.method;

      if (p === '/api/collections') {
        if (m === 'GET') {
          const asked = url.searchParams.get('user')?.trim();
          if (asked) {
            const owner = await collections.resolveOwner(asked);
            if (!owner) return json(404, { error: 'Player not found' });
            return json(200, { collections: await collections.list(owner, viewer) });
          }
          const me = signedIn();
          return json(200, { collections: await collections.list(me, me, linkParam(url.searchParams.get('link'))) });
        }
        if (m === 'POST') return json(201, { collection: await collections.create(signedIn(), await readJson(req)) });
        return json(405, { error: 'Method not allowed' });
      }

      let r = ONE.exec(p);
      if (r) {
        const id = r[1]!;
        if (m === 'GET') return json(200, { collection: await collections.get(id, viewer) });
        if (m === 'PATCH') return json(200, { collection: await collections.update(signedIn(), id, await readJson(req)) });
        if (m === 'DELETE') {
          await collections.remove(signedIn(), id);
          return json(200, { ok: true });
        }
        return json(405, { error: 'Method not allowed' });
      }

      r = ITEMS.exec(p);
      if (r) {
        const id = r[1]!;
        if (m === 'POST') {
          const out = await collections.addItem(signedIn(), id, await readJson(req));
          return json(out.added ? 201 : 200, out);
        }
        if (m === 'DELETE') {
          const body = await readJson(req);
          const link = body.link as AppPath | undefined;
          if (!link || typeof link.path !== 'string') return json(400, { error: 'Say which game to remove' });
          await collections.removeItem(signedIn(), id, { link });
          return json(200, { ok: true });
        }
        return json(405, { error: 'Method not allowed' });
      }

      r = ITEM.exec(p);
      if (r) {
        if (m !== 'DELETE') return json(405, { error: 'Method not allowed' });
        await collections.removeItem(signedIn(), r[1]!, { id: r[2]! });
        return json(200, { ok: true });
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof CollectionsError) return json(e.status, { error: e.message });
      console.error('collections request failed', e);
      return json(500, { error: 'Something went wrong. Try again.' });
    }
  };
}
