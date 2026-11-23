import type { IncomingMessage } from 'node:http';

import type { HttpRoute } from '../social/http';
import type { StripeClient } from './stripe';

/** Amounts offered on the donate page, and the range a custom amount may take, in cents. */
export const DONATION = { min: 200, max: 50_000, currencies: ['eur', 'usd', 'gbp'] } as const;

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const c of req) {
    raw += String(c);
    if (raw.length > 4096) return {};
  }
  try {
    const v = JSON.parse(raw || '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Donations through Stripe Checkout:
 *
 *   GET  /api/donate                                   { enabled }
 *   POST /api/donate   { amountCents, currency, returnUrl }  → { url }  (open it to pay)
 *
 * Without STRIPE_SECRET_KEY donations are switched off and the page says so.
 */
export function donateRoutes(stripe: StripeClient | null): HttpRoute {
  return async (req, res, url) => {
    if (url.pathname !== '/api/donate') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
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
    if (req.method === 'GET') return json(200, { enabled: !!stripe, ...DONATION });
    if (req.method !== 'POST') return json(405, { error: 'GET or POST' });
    if (!stripe) return json(503, { error: 'Donations are not open yet' });
    const b = await readJson(req);
    const amount = Math.round(Number(b.amountCents));
    const currency = String(b.currency ?? 'eur').toLowerCase();
    const back = typeof b.returnUrl === 'string' && /^https?:\/\//.test(b.returnUrl) ? b.returnUrl : null;
    if (!Number.isFinite(amount) || amount < DONATION.min || amount > DONATION.max) return json(400, { error: 'Choose an amount between 2 and 500' });
    if (!(DONATION.currencies as readonly string[]).includes(currency)) return json(400, { error: 'Unsupported currency' });
    if (!back) return json(400, { error: 'Missing return address' });
    try {
      const join = back.includes('?') ? '&' : '?';
      const session = await stripe.createCheckout({
        amountCents: amount,
        currency,
        productName: 'Donation to ChessMate',
        successUrl: `${back}${join}donated=1`,
        cancelUrl: back,
        metadata: { kind: 'donation' },
      });
      return json(200, { url: session.url });
    } catch (e) {
      console.error('donation checkout failed', e);
      return json(502, { error: 'Could not reach the payment provider. Try again.' });
    }
  };
}
