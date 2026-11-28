import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { formEncode, stripeClient, verifyStripeEvent } from '../src/payments/stripe';

describe('Stripe', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid' } } });
  const sign = (t: number, b = body) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${b}`).digest('hex')}`;

  it('accepts a correctly signed, fresh event', () => {
    const now = 1_800_000_000_000;
    const ev = verifyStripeEvent(body, sign(now / 1000), secret, now);
    expect(ev?.type).toBe('checkout.session.completed');
    expect(ev?.data.object.id).toBe('cs_1');
  });

  it('rejects wrong, tampered or old signatures', () => {
    const now = 1_800_000_000_000;
    expect(verifyStripeEvent(body, undefined, secret, now)).toBeNull();
    const good = sign(now / 1000);
    const flipped = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
    expect(verifyStripeEvent(body, flipped, secret, now)).toBeNull();
    expect(verifyStripeEvent(body.replace('cs_1', 'cs_2'), sign(now / 1000), secret, now)).toBeNull();
    expect(verifyStripeEvent(body, sign(now / 1000 - 3600), secret, now)).toBeNull();
  });

  it('encodes nested Checkout parameters the way Stripe expects', () => {
    const s = decodeURIComponent(formEncode({ mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: 500 } }], metadata: { tournamentId: 't1' } }));
    expect(s).toContain('line_items[0][price_data][unit_amount]=500');
    expect(s).toContain('metadata[tournamentId]=t1');
  });

  it('creates a Checkout session through the REST API', async () => {
    let sent: { url: string; body: string; auth: string } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body), auth: String((init.headers as Record<string, string>).authorization) };
      return new Response(JSON.stringify({ id: 'cs_9', url: 'https://checkout.stripe.com/c/cs_9' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await stripeClient('sk_test_1', fake).createCheckout({ amountCents: 500, currency: 'eur', productName: 'Entry', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', metadata: { tournamentId: 't1', userId: 'u1' } });
    expect(r).toEqual({ id: 'cs_9', url: 'https://checkout.stripe.com/c/cs_9' });
    expect(sent!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(sent!.auth).toBe('Bearer sk_test_1');
    expect(decodeURIComponent(sent!.body)).toContain('metadata[userId]=u1');
  });

  it('makes a one-time Payment Link from a price, and switches it off', async () => {
    const sent: { url: string; body: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: decodeURIComponent(String(init.body)) });
      if (url.endsWith('/prices')) return new Response(JSON.stringify({ id: 'price_1' }), { status: 200 });
      if (url.endsWith('/payment_links')) return new Response(JSON.stringify({ id: 'plink_1', url: 'https://buy.stripe.com/x' }), { status: 200 });
      return new Response(JSON.stringify({ id: 'plink_1', active: false }), { status: 200 });
    }) as unknown as typeof fetch;
    const s = stripeClient('sk_test_1', fake);
    const r = await s.createPaymentLink({ amountCents: 30000, currency: 'eur', productName: 'Home top', redirectUrl: 'https://x/sponsorship/t?paid=1', metadata: { kind: 'sponsor', applicationId: 'a1' } });
    expect(r).toEqual({ id: 'plink_1', url: 'https://buy.stripe.com/x' });
    expect(sent[0]!.body).toContain('unit_amount=30000');
    expect(sent[0]!.body).toContain('product_data[name]=Home top');
    expect(sent[1]!.body).toContain('line_items[0][price]=price_1');
    expect(sent[1]!.body).toContain('restrictions[completed_sessions][limit]=1');
    expect(sent[1]!.body).toContain('after_completion[redirect][url]=https://x/sponsorship/t?paid=1');
    expect(sent[1]!.body).toContain('metadata[applicationId]=a1');
    await s.deactivatePaymentLink('plink_1');
    expect(sent[2]).toEqual({ url: 'https://api.stripe.com/v1/payment_links/plink_1', body: 'active=false' });
  });

  it('throws Stripe\'s own message when it refuses', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: 'Invalid API Key provided' } }), { status: 401 })) as unknown as typeof fetch;
    await expect(stripeClient('sk_bad', fake).createPaymentLink({ amountCents: 100, currency: 'eur', productName: 'x', redirectUrl: 'https://x', metadata: {} })).rejects.toThrow('Invalid API Key provided');
  });
});
