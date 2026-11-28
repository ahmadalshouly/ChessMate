import type { IncomingMessage } from 'node:http';

import type { StripeEvent } from '../payments/stripe';
import type { HttpRoute, ResolveUser } from '../social/http';
import { isAccountId } from '../social/service';
import { TournamentError, type TournamentService } from './service';

/** Stripe events for entry fees: Checkout Sessions this service started (looked up by session id). */
export function tournamentStripeHandler(tournaments: TournamentService) {
  return async (event: StripeEvent): Promise<boolean> => {
    const obj = event.data.object;
    const sessionId = typeof obj.id === 'string' ? obj.id : '';
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid') {
      await tournaments.paymentCompleted(sessionId);
    } else if (event.type === 'checkout.session.expired') {
      await tournaments.paymentExpired(sessionId);
    }
    return false;
  };
}

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
 *   GET  /api/tournaments/:id/chat        { messages } the latest chat messages
 *   POST /api/tournaments/:id/chat        { text } → { message } (accounts)
 *   POST /api/tournaments/:id/join        { acceptRules: true } free tournaments (or rejoin)
 *   POST /api/tournaments/:id/checkout    { acceptRules: true, returnUrl } → { url } Stripe Checkout for the entry fee
 *   POST /api/tournaments/:id/withdraw
 *   POST /api/tournaments/:id/payout      { method, details, note? } prize winners
 *   POST /api/sponsors                    { name, email, company?, website?, budget?, message, spot? } sponsor application → { ok, token }
 *
 * Entry fee payments are confirmed by the Stripe webhook (payments/webhook.ts) through `tournamentStripeHandler`.
 */
export function tournamentRoutes(tournaments: TournamentService, resolveUser: ResolveUser): HttpRoute {
  return async (req, res, url) => {
    const p = url.pathname;
    const mine = p === '/api/tournaments' || p.startsWith('/api/tournaments/') || p === '/api/sponsors';
    if (!mine) return false;
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return true as const;
    };

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
      if (req.method === 'GET' && id && action === 'chat') return json(200, { messages: tournaments.chat(id) });
      if (req.method === 'GET' && id && !action) return json(200, { tournament: tournaments.detail(account, id), paymentsEnabled: tournaments.paymentsEnabled });
      if (req.method === 'POST' && id && action) {
        if (!viewer) return json(401, { error: action === 'chat' ? 'Sign in to chat' : 'Sign in to join tournaments' });
        if (!account) return json(403, { error: action === 'chat' ? 'Create an account to chat' : 'Create an account to join tournaments' });
        switch (action) {
          case 'chat':
            return json(200, { message: await tournaments.postChat(account, id, await readJson(req)) });
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
