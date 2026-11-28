import type { IncomingMessage } from 'node:http';

import { clientIp } from '../clientIp';
import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import type { AnalyticsService } from './service';

const MAX_BODY = 64 * 1024;

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const c of req) {
    raw += String(c);
    if (raw.length > MAX_BODY) return null;
  }
  try {
    return JSON.parse(raw || 'null') as unknown;
  } catch {
    return null;
  }
}

/**
 * App analytics. Public: guests count too, and the app only sends after the
 * visitor allowed analytics. A sign-in token, when sent, ties events to the account.
 *
 *   POST /api/events          AnalyticsBatch → { kept }
 *   POST /api/events/forget   { deviceId } deletes what that device sent (consent withdrawn)
 *
 * Like sponsor counts, these never fail the app: bad input answers 200 with kept 0.
 */
export function analyticsRoutes(analytics: AnalyticsService, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/events' && p !== '/api/events/forget') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    try {
      const body = await readJson(req);
      if (p === '/api/events/forget') {
        const deviceId = body && typeof body === 'object' ? (body as Record<string, unknown>).deviceId : undefined;
        return json(200, { deleted: await analytics.forget(deviceId) });
      }
      const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      const resolved = token ? await resolveUser(token) : null;
      const userId = resolved && isAccountId(resolved) ? resolved : null;
      return json(200, { kept: await analytics.ingest(body, userId, clientIp(req)) });
    } catch (e) {
      console.warn('[analytics]', e instanceof Error ? e.message : e);
      return json(200, { kept: 0 });
    }
  };
}
