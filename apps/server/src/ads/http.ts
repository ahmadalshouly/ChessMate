import type { IncomingMessage } from 'node:http';

import type { HttpRoute } from '../social/http';
import type { AdService } from './service';

async function readJson(req: IncomingMessage, max = 4096): Promise<Record<string, unknown>> {
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
 * Sponsored spots for the app. No sign-in: these are public, and the app asks
 * for them on screens anyone can open.
 *
 *   GET  /api/ads                 { ads } the live sponsor on every switched-on spot
 *   GET  /api/ads/:id/image       the uploaded image for a placement
 *   POST /api/ads/:id/click       counts a tap  (no body)
 *   POST /api/ads/:id/view        counts a view (no body)
 *
 * The counts are a courtesy to the sponsor, not billing, so they are never
 * allowed to fail the request: an unknown id answers 200 and is dropped.
 */
export function adRoutes(ads: AdService): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    if (p !== '/api/ads' && !p.startsWith('/api/ads/')) return false;
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

    if (p === '/api/ads') {
      if (req.method !== 'GET') return json(405, { error: 'GET only' });
      return json(200, { ads: ads.creatives() });
    }

    const [id, action] = p.split('/').filter(Boolean).slice(2);
    if (!id) return json(404, { error: 'Not found' });

    if (req.method === 'GET' && action === 'image') {
      const img = ads.image(id);
      if (!img) return json(404, { error: 'No image' });
      // The id never changes once placed and the image is part of it, so this can cache hard.
      res.writeHead(200, { 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
      res.end(img.data);
      return true;
    }

    if (req.method === 'POST' && (action === 'click' || action === 'view')) {
      await readJson(req);
      await ads.count(id, action === 'click' ? 'click' : 'impression');
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found' });
  };
}
