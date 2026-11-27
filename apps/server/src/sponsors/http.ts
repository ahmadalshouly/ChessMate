import type { IncomingMessage } from 'node:http';

import { SPONSOR_MESSAGE_MAX } from '@chessmate/core';

import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { SponsorDeskError, type SponsorDesk } from './service';

async function readJson(req: IncomingMessage, max = SPONSOR_MESSAGE_MAX * 4 + 1024): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) {
    raw += String(c);
    if (raw.length > max) throw new SponsorDeskError(400, 'Body too large');
  }
  try {
    const v = JSON.parse(raw || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new SponsorDeskError(400, 'Invalid JSON');
  }
}

/**
 * A sponsor applicant's own page. The token from their email is the key, so
 * no account is needed:
 *
 *   GET  /api/sponsorship/mine              { sponsorships } applications made while signed in (accounts)
 *   GET  /api/sponsorship/:token            the application, the conversation and the payment links
 *   POST /api/sponsorship/:token/messages   { body } → the page again, with the reply
 */
export function sponsorshipRoutes(desk: SponsorDesk, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    if (!p.startsWith('/api/sponsorship/')) return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    // The token is a password: keep it out of shared caches and referrers.
    res.setHeader('referrer-policy', 'no-referrer');
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
      const [token = '', action] = p.split('/').filter(Boolean).slice(2);
      if (token === 'mine') {
        if (req.method !== 'GET') return json(405, { error: 'GET only' });
        const auth = req.headers.authorization;
        const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        const viewer = bearer ? await resolveUser(bearer) : null;
        if (!viewer || !isAccountId(viewer)) return json(401, { error: 'Sign in to see your sponsorships' });
        return json(200, { sponsorships: await desk.mine(viewer) });
      }
      if (req.method === 'GET' && !action) return json(200, { sponsorship: await desk.portal(token) });
      if (req.method === 'POST' && action === 'messages') return json(200, { sponsorship: await desk.applicantMessage(token, (await readJson(req)).body) });
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof SponsorDeskError) return json(e.status, { error: e.message });
      console.error('sponsorship route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
