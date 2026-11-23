import type { IncomingMessage } from 'node:http';
import { SocialError, isAccountId } from '../social/service';
import type { HttpRoute, ResolveUser } from '../social/http';
import type { MessageService } from './service';

const PREFIX = '/api/messages';
const KEY = '([A-Za-z0-9_-]{1,64})';

/**
 * Direct messages. All routes need `Authorization: Bearer <token>` for an account.
 *
 *   GET  /api/messages                      conversations (newest first) and the unread total
 *   GET  /api/messages/unread               { unread }
 *   GET  /api/messages/:key?before=         one conversation ("staff" for the ChessMate team), marks it read
 *   POST /api/messages/:userId  { body }    send a message
 *   POST /api/messages/:key/read            mark a conversation read
 *   GET  /api/messages/:userId/can          { ok, reason } whether you may message this player
 */
export function messageRoutes(messages: MessageService, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
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
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    try {
      const viewer = token ? await resolveUser(token) : null;
      if (!viewer) return json(401, { error: 'Sign in to use messages' });
      if (!isAccountId(viewer)) return json(403, { error: 'Create an account to send messages' });
      const path = url.pathname.slice(PREFIX.length).replace(/^\//, '');
      let m: RegExpExecArray | null;
      if (req.method === 'GET' && path === '') return json(200, await messages.conversations(viewer));
      if (req.method === 'GET' && path === 'unread') return json(200, { unread: await messages.unreadTotal(viewer) });
      if (req.method === 'GET' && (m = new RegExp(`^${KEY}/can$`).exec(path))) return json(200, await messages.canMessage(viewer, m[1]!));
      if (req.method === 'POST' && (m = new RegExp(`^${KEY}/read$`).exec(path))) return json(200, await messages.markRead(viewer, m[1]!));
      if (req.method === 'GET' && (m = new RegExp(`^${KEY}$`).exec(path))) {
        const before = Number(url.searchParams.get('before'));
        return json(200, await messages.thread(viewer, m[1]!, Number.isFinite(before) && before > 0 ? before : undefined));
      }
      if (req.method === 'POST' && (m = new RegExp(`^${KEY}$`).exec(path))) {
        const body = await readJson(req);
        return json(200, { message: await messages.send(viewer, m[1]!, body.body) });
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof SocialError) return json(e.status, { error: e.message });
      if (e instanceof SyntaxError) return json(400, { error: 'Invalid JSON' });
      console.error('message route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
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
