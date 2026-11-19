import type { IncomingMessage } from 'node:http';

import { verifyStripeEvent } from '../payments/stripe';
import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { TournamentError, type TournamentService } from './service';

async function readBody(req: IncomingMessage, max = 32 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new TournamentError(400, 'Body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new TournamentError(400, 'Invalid JSON');
  }
}

/**
 * Tournaments for players. Reading needs no sign-in; joining needs an account.
 *
 *   GET  /api/tournaments                 list (running, upcoming, then past)
 *   GET  /api/tournaments/:id             details, standings and the viewer's state
 *   GET  /api/tournaments/:id/logo        sponsor logo image
 *   POST /api/tournaments/:id/join        { acceptRules: true } free tournaments (or rejoin)
 *   POST /api/tournaments/:id/checkout    { acceptRules: true, returnUrl } → { url } Stripe Checkout for the entry fee
 *   POST /api/tournaments/:id/withdraw
 *   POST /api/tournaments/:id/payout      { method, details, note? } prize winners
 *   POST /api/sponsors                    { name, email, company?, website?, budget?, message } sponsor application
 *   POST /api/stripe/webhook              Stripe events (signed with STRIPE_WEBHOOK_SECRET)
 */
export function tournamentRoutes(tournaments: TournamentService, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    const mine = p === '/api/tournaments' || p.startsWith('/api/tournaments/') || p === '/api/sponsors' || p === '/api/stripe/webhook';
    if (!mine) return false;
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return true as const;
    };

    // Stripe calls this server to server: no CORS, raw body for the signature.
    if (p === '/api/stripe/webhook') {
      if (req.method !== 'POST') return json(405, { error: 'POST only' });
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return json(503, { error: 'Webhook secret not configured' });
      try {
        const raw = await readBody(req, 512 * 1024);
        const event = verifyStripeEvent(raw, req.headers['stripe-signature'] as string | undefined, secret);
        if (!event) return json(400, { error: 'Bad signature' });
        const obj = event.data.object;
        const sessionId = typeof obj.id === 'string' ? obj.id : '';
        if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid') {
          await tournaments.paymentCompleted(sessionId);
        } else if (event.type === 'checkout.session.expired') {
          await tournaments.paymentExpired(sessionId);
        }
        return json(200, { received: true });
      } catch (e) {
        console.error('stripe webhook failed', e);
        return json(500, { error: 'Webhook failed' });
      }
    }

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    try {
      const auth = req.headers.authorization;
      const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const viewer = token ? await resolveUser(token) : null;
      const account = viewer && isAccountId(viewer) ? viewer : null;

      if (p === '/api/sponsors') {
        if (req.method !== 'POST') return json(405, { error: 'POST only' });
        return json(200, await tournaments.applySponsor(account, await readJson(req)));
      }

      const [id, action] = p.split('/').filter(Boolean).slice(2);
      if (req.method === 'GET' && !id) return json(200, { tournaments: tournaments.list(account), paymentsEnabled: tournaments.paymentsEnabled });
      if (req.method === 'GET' && id && action === 'logo') {
        const logo = tournaments.logoOf(id);
        if (!logo) return json(404, { error: 'No logo' });
        res.writeHead(200, { 'content-type': logo.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
        res.end(logo.bytes);
        return true;
      }
      if (req.method === 'GET' && id && !action) return json(200, { tournament: tournaments.detail(account, id), paymentsEnabled: tournaments.paymentsEnabled });
      if (req.method === 'POST' && id && action) {
        if (!viewer) return json(401, { error: 'Sign in to join tournaments' });
        if (!account) return json(403, { error: 'Create an account to join tournaments' });
        switch (action) {
          case 'join':
            return json(200, { tournament: await tournaments.join(account, id, await readJson(req)) });
          case 'checkout':
            return json(200, await tournaments.checkout(account, id, await readJson(req)));
          case 'withdraw':
            return json(200, { tournament: tournaments.withdraw(account, id) });
          case 'payout':
            return json(200, { tournament: await tournaments.requestPayout(account, id, await readJson(req)) });
        }
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof TournamentError) return json(e.status, { error: e.message });
      console.error('tournament route failed', e);
      return json(500, { error: 'Something went wrong' });
    }
  };
}
