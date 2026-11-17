import type { IncomingMessage, ServerResponse } from 'node:http';
import { SocialError, isAccountId, type SocialService } from './service';

/** Same shape as the server's pluggable HTTP routes: return true when handled. */
export type HttpRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;

/** Maps a bearer token to an account id, or null. */
export type ResolveUser = (token: string) => string | null | Promise<string | null>;

const PREFIX = '/api/social/';
const ID = '([A-Za-z0-9_-]{1,64})';

type Handler = (viewer: string, m: string[], url: URL, body: Record<string, unknown>) => unknown;

/**
 * REST API for the social graph. All routes need `Authorization: Bearer <token>`
 * for a registered account; guests get 403.
 *
 *   GET    /api/social/search?q=           users by username prefix, with relationship
 *   GET    /api/social/users/:id           one user's relationship, presence and counts
 *   GET    /api/social/friends             friends with presence (playing, online, offline)
 *   DELETE /api/social/friends/:id         unfriend
 *   GET    /api/social/requests            { incoming, outgoing }
 *   POST   /api/social/requests            { userId } send (auto-accepts a reverse request)
 *   POST   /api/social/requests/:id/accept
 *   POST   /api/social/requests/:id/decline
 *   DELETE /api/social/requests/:id        cancel your outgoing request
 *   GET    /api/social/following | /followers
 *   PUT    /api/social/following/:id       follow;  DELETE to unfollow
 *   GET    /api/social/blocks
 *   PUT    /api/social/blocks/:id          block;   DELETE to unblock
 *   GET    /api/social/live                live games of friends and followed players
 *   GET    /api/social/feed?before=        activity feed, paginated by `next`
 */
export function socialRoutes(social: SocialService, resolveUser: ResolveUser): HttpRoute {
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^search$/, (v, _m, url) => social.search(v, url.searchParams.get('q') ?? '')],
    ['GET', new RegExp(`^users/${ID}$`), (v, m) => social.profile(v, m[1]!)],
    ['GET', /^friends$/, (v) => social.friends(v)],
    ['DELETE', new RegExp(`^friends/${ID}$`), (v, m) => social.unfriend(v, m[1]!)],
    ['GET', /^requests$/, (v) => social.requests(v)],
    ['POST', /^requests$/, (v, _m, _u, b) => social.sendRequest(v, String(b.userId ?? ''))],
    ['POST', new RegExp(`^requests/${ID}/accept$`), (v, m) => social.acceptRequest(v, m[1]!)],
    ['POST', new RegExp(`^requests/${ID}/decline$`), (v, m) => social.declineRequest(v, m[1]!)],
    ['DELETE', new RegExp(`^requests/${ID}$`), (v, m) => social.cancelRequest(v, m[1]!)],
    ['GET', /^following$/, (v) => social.following(v)],
    ['GET', /^followers$/, (v) => social.followers(v)],
    ['PUT', new RegExp(`^following/${ID}$`), (v, m) => social.follow(v, m[1]!)],
    ['DELETE', new RegExp(`^following/${ID}$`), (v, m) => social.unfollow(v, m[1]!)],
    ['GET', /^blocks$/, (v) => social.blocked(v)],
    ['PUT', new RegExp(`^blocks/${ID}$`), (v, m) => social.block(v, m[1]!)],
    ['DELETE', new RegExp(`^blocks/${ID}$`), (v, m) => social.unblock(v, m[1]!)],
    ['GET', /^live$/, (v) => social.liveGames(v)],
    [
      'GET',
      /^feed$/,
      (v, _m, url) => {
        const before = Number(url.searchParams.get('before'));
        return social.feed(v, Number.isFinite(before) && before > 0 ? before : undefined);
      },
    ],
  ];

  return async (req, res, url) => {
    if (!url.pathname.startsWith(PREFIX)) return false;
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    const path = url.pathname.slice(PREFIX.length);
    let match: { h: Handler; m: string[] } | null = null;
    let pathKnown = false;
    for (const [method, re, h] of routes) {
      const m = re.exec(path);
      if (!m) continue;
      pathKnown = true;
      if (method === req.method) {
        match = { h, m };
        break;
      }
    }
    if (!match) return json(res, pathKnown ? 405 : 404, { error: pathKnown ? 'Method not allowed' : 'Not found' });

    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    try {
      const viewer = token ? await resolveUser(token) : null;
      if (!viewer) return json(res, 401, { error: 'Sign in to use friends' });
      if (!isAccountId(viewer)) return json(res, 403, { error: 'Create an account to add friends' });
      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
      const out = await match.h(viewer, match.m, url, body);
      return json(res, 200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof SocialError) return json(res, e.status, { error: e.message });
      if (e instanceof SyntaxError) return json(res, 400, { error: 'Invalid JSON' });
      console.error('social route failed', e);
      return json(res, 500, { error: 'Something went wrong' });
    }
  };
}

function cors(res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
  return true;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 16 * 1024) throw new SocialError(400, 'Body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
