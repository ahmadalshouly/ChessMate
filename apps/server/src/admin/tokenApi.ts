import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ModAction, Moderation, ReportStatus } from '../moderation';

/**
 * Moderation HTTP API under /admin. Protected by a bearer token from the
 * ADMIN_TOKEN environment variable; when it is unset the API is disabled.
 * Once accounts land, swap the shared token for a session with an admin role.
 *
 *   GET    /admin/reports?status=open|dismissed|actioned|all
 *   GET    /admin/reports/:id
 *   POST   /admin/reports/:id   { action: dismiss|warn|chat_ban|unban, note?, durationHours? }
 *   GET    /admin/chat/:gameId
 *   GET    /admin/chat-bans
 *   POST   /admin/chat-bans     { playerId, name?, hours, reason? }
 *   DELETE /admin/chat-bans/:playerId
 */
export function handleAdmin(req: IncomingMessage, res: ServerResponse, mod: Moderation, adminToken: string | undefined): boolean {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/admin')) return false;

  // Bearer-token API (no cookies), so a permissive CORS policy is safe and lets the web app call it.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  if (!adminToken) {
    json(res, 503, { error: 'Admin API disabled: set ADMIN_TOKEN on the server' });
    return true;
  }
  if (!authorized(req.headers.authorization, adminToken)) {
    json(res, 401, { error: 'Invalid admin token' });
    return true;
  }

  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "admin"
  const route = `${req.method} ${parts[0] ?? ''}${parts.length > 1 ? '/:id' : ''}`;
  const id = parts[1] ? decodeURIComponent(parts[1]) : '';

  const run = async () => {
    switch (route) {
      case 'GET reports': {
        const status = (url.searchParams.get('status') ?? 'open') as ReportStatus | 'all';
        const reports = mod.store
          .listReports()
          .filter((r) => status === 'all' || r.status === status)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => ({ ...r, targetReportCount: mod.reportCountFor(r.targetId), targetChatBan: mod.activeBan(r.targetId) ?? null }));
        return json(res, 200, { reports });
      }
      case 'GET reports/:id': {
        const r = mod.store.getReport(id);
        return r ? json(res, 200, { report: r }) : json(res, 404, { error: 'Not found' });
      }
      case 'POST reports/:id': {
        const body = await readJson(req);
        const action = body.action as ModAction;
        if (!['dismiss', 'warn', 'chat_ban', 'unban'].includes(action)) return json(res, 400, { error: 'Unknown action' });
        const r = mod.resolve(id, action, {
          note: typeof body.note === 'string' ? body.note.slice(0, 500) : '',
          durationHours: typeof body.durationHours === 'number' ? body.durationHours : undefined,
          by: 'admin',
        });
        return r ? json(res, 200, { report: r }) : json(res, 404, { error: 'Not found' });
      }
      case 'GET chat/:id':
        return json(res, 200, { lines: mod.chatLog(id) });
      case 'GET chat-bans':
        return json(res, 200, { bans: mod.store.listBans().filter((b) => mod.activeBan(b.playerId)) });
      case 'POST chat-bans': {
        const body = await readJson(req);
        if (typeof body.playerId !== 'string' || typeof body.hours !== 'number') return json(res, 400, { error: 'playerId and hours required' });
        const ban = mod.ban(body.playerId, typeof body.name === 'string' ? body.name : body.playerId, body.hours, typeof body.reason === 'string' ? body.reason : '');
        return json(res, 200, { ban });
      }
      case 'DELETE chat-bans/:id':
        mod.store.deleteBan(id);
        return json(res, 200, { ok: true });
      default:
        return json(res, 404, { error: 'Not found' });
    }
  };
  run().catch((e) => json(res, 400, { error: e instanceof Error ? e.message : 'Bad request' }));
  return true;
}

function authorized(header: string | undefined, token: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? '');
  if (!m) return false;
  const a = Buffer.from(m[1]!);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 16 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(v && typeof v === 'object' ? v : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}
