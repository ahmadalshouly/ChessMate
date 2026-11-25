import type { IncomingMessage } from 'node:http';

import { isBotGameResult } from '@chessmate/core';

import type { HttpRoute } from '../social/http';
import type { BotService } from './service';

async function readJson(req: IncomingMessage, max = 1024): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) {
    raw += String(c);
    if (raw.length > max) return {};
  }
  try {
    const v = JSON.parse(raw || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Online computer opponents for the app. No sign-in: the vs-computer screen
 * is open to everyone, guests included.
 *
 *   GET  /api/bots                 { bots } every switched-on online bot
 *   GET  /api/bots/:id/avatar      the uploaded picture of one
 *   POST /api/bots/:id/result      { result: win | loss | draw } counts a finished game (the player's side)
 *
 * The count is a courtesy for staff, so it never fails the request: an
 * unknown id or result answers 200 and is dropped.
 */
export function botRoutes(bots: BotService): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/bots' && !p.startsWith('/api/bots/')) return false;
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    // The app sends its sign-in token with every request when it has one, so a preflight must allow it.
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }

    if (p === '/api/bots') {
      if (req.method !== 'GET') return json(405, { error: 'GET only' });
      return json(200, { bots: bots.list() });
    }

    const [id, action] = p.split('/').filter(Boolean).slice(2);
    if (!id) return json(404, { error: 'Not found' });

    if (req.method === 'GET' && action === 'avatar') {
      const img = bots.avatar(id);
      if (!img) return json(404, { error: 'No picture' });
      // The app's path carries a version that changes on every save, so this can cache hard.
      res.writeHead(200, { 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
      res.end(img.data);
      return true;
    }

    if (req.method === 'POST' && action === 'result') {
      const body = await readJson(req);
      if (isBotGameResult(body.result)) await bots.countGame(id, body.result);
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found' });
  };
}
