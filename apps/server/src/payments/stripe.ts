import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal Stripe client over the REST API (no SDK): Checkout Sessions for
 * tournament entry fees and donations, Payment Links that staff send to
 * sponsors, and webhook signature checks. Configured with STRIPE_SECRET_KEY
 * and STRIPE_WEBHOOK_SECRET; without the key, paid tournaments cannot be
 * created, donations are closed and staff cannot send payment links.
 */
export interface StripeClient {
  createCheckout(input: {
    amountCents: number;
    currency: string;
    productName: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    /** "donate" makes Stripe's button say Donate. */
    submitType?: 'pay' | 'donate';
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  /**
   * A Payment Link for one fixed amount that can be paid once. It does not
   * expire (unlike a Checkout Session), so it can sit in an email for weeks.
   */
  createPaymentLink(input: {
    amountCents: number;
    currency: string;
    productName: string;
    /** Where Stripe sends the payer afterwards. */
    redirectUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  /** Switches a Payment Link off so nobody can pay it again. */
  deactivatePaymentLink(id: string): Promise<void>;
}

export class StripeError extends Error {}

/** Stripe's form encoding: nested keys as a[b][c]=v. */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => parts.push(typeof item === 'object' ? formEncode(item as Record<string, unknown>, `${key}[${i}]`) : `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`));
    else if (typeof v === 'object') parts.push(formEncode(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join('&');
}

export function stripeClient(secretKey: string, fetchImpl: typeof fetch = fetch): StripeClient {
  const post = async <T extends { id?: string; url?: string }>(path: string, body: Record<string, unknown>): Promise<T> => {
    const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: formEncode(body),
    });
    const out = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok || !out.id) throw new StripeError(out.error?.message ?? `Stripe error ${res.status}`);
    return out;
  };
  return {
    async createPaymentLink(i) {
      // A Price first (Payment Links take a price, not inline amounts), then the link.
      const price = await post<{ id: string }>('prices', { currency: i.currency, unit_amount: i.amountCents, product_data: { name: i.productName, metadata: i.metadata } });
      const link = await post<{ id: string; url: string }>('payment_links', {
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: i.metadata,
        payment_intent_data: { metadata: i.metadata },
        after_completion: { type: 'redirect', redirect: { url: i.redirectUrl } },
        restrictions: { completed_sessions: { limit: 1 } },
      });
      if (!link.url) throw new StripeError('Stripe returned no link');
      return { id: link.id, url: link.url };
    },
    async deactivatePaymentLink(id) {
      await post(`payment_links/${encodeURIComponent(id)}`, { active: false });
    },
    async createCheckout(i) {
      const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: formEncode({
          mode: 'payment',
          submit_type: i.submitType,
          success_url: i.successUrl,
          cancel_url: i.cancelUrl,
          customer_email: i.customerEmail,
          client_reference_id: i.metadata.userId,
          metadata: i.metadata,
          payment_intent_data: { metadata: i.metadata },
          line_items: [{ quantity: 1, price_data: { currency: i.currency, unit_amount: i.amountCents, product_data: { name: i.productName } } }],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
      if (!res.ok || !body.id || !body.url) throw new StripeError(body.error?.message ?? `Stripe error ${res.status}`);
      return { id: body.id, url: body.url };
    },
  };
}

export function stripeFromEnv(env: NodeJS.ProcessEnv = process.env): StripeClient | null {
  return env.STRIPE_SECRET_KEY ? stripeClient(env.STRIPE_SECRET_KEY) : null;
}

/**
 * Checks a `Stripe-Signature` header (t=…,v1=…) against the raw body. Returns
 * the parsed event or null when the signature is wrong or older than `toleranceS`.
 */
export interface StripeEvent {
  id?: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function verifyStripeEvent(rawBody: string, header: string | undefined, secret: string, nowMs = Date.now(), toleranceS = 300): StripeEvent | null {
  if (!header) return null;
  const fields = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...rest] = kv.split('=');
      return [k?.trim() ?? '', rest.join('=')];
    }),
  );
  const t = Number(fields.t);
  const sigs = header
    .split(',')
    .filter((kv) => kv.trim().startsWith('v1='))
    .map((kv) => kv.trim().slice(3));
  if (!Number.isFinite(t) || !sigs.length) return null;
  if (Math.abs(nowMs / 1000 - t) > toleranceS) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) return null;
  try {
    return JSON.parse(rawBody) as StripeEvent;
  } catch {
    return null;
  }
}
