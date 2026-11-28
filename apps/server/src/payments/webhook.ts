import type { IncomingMessage } from 'node:http';

import type { HttpRoute } from '../social/http';
import { verifyStripeEvent, type StripeEvent } from './stripe';

/**
 * Handles one Stripe event. Returns true when the event belonged to it, so
 * later handlers are skipped. Must be safe to receive twice: Stripe retries.
 */
export type StripeEventHandler = (event: StripeEvent) => Promise<boolean>;

async function readRaw(req: IncomingMessage, max = 512 * 1024): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * POST /api/stripe/webhook: one endpoint for every Stripe payment (sponsor
 * payment links, donations, tournament entry fees), signed with
 * STRIPE_WEBHOOK_SECRET. Events go to each handler in turn until one claims it.
 * Answers 500 when a handler fails, so Stripe retries later.
 */
export function stripeWebhookRoute(handlers: StripeEventHandler[], secret = () => process.env.STRIPE_WEBHOOK_SECRET): HttpRoute {
  return async (req, res, url) => {
    if (url.pathname !== '/api/stripe/webhook') return false;
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const key = secret();
    if (!key) return json(503, { error: 'Webhook secret not configured' });
    const raw = await readRaw(req);
    if (raw === null) return json(413, { error: 'Body too large' });
    const event = verifyStripeEvent(raw, req.headers['stripe-signature'] as string | undefined, key);
    if (!event) return json(400, { error: 'Bad signature' });
    try {
      for (const h of handlers) if (await h(event)) break;
      return json(200, { received: true });
    } catch (e) {
      console.error(`stripe webhook failed (${event.type})`, e);
      return json(500, { error: 'Webhook failed' });
    }
  };
}
