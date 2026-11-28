import type { IncomingMessage } from 'node:http';

import { donationBySession, getAppSetting, insertDonation, paidDonations, setAppSetting, updateDonation, type Database } from '@chessmate/db';

import type { HttpRoute } from '../social/http';
import type { StripeClient, StripeEvent } from './stripe';

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
 * Staff switch for the "Support us" entry in the app (More menu, sidebar,
 * About). Off hides it everywhere without a new app build. Stored in
 * app_settings, so it survives restarts; on by default.
 */
export class SupportSwitch {
  static readonly KEY = 'support.shown';
  private value = true;
  constructor(private readonly db: Database | null = null) {}

  async load(): Promise<this> {
    if (this.db) this.value = (await getAppSetting<boolean>(this.db, SupportSwitch.KEY)) !== false;
    return this;
  }

  get shown(): boolean {
    return this.value;
  }

  async set(shown: boolean): Promise<void> {
    if (this.db) await setAppSetting(this.db, SupportSwitch.KEY, shown);
    this.value = shown;
  }
}

export interface DonationTotals {
  /** Paid donations in the last 30 days and all time, per currency, in cents. */
  last30: Record<string, { cents: number; count: number }>;
  allTime: Record<string, { cents: number; count: number }>;
  recent: { id: string; amountCents: number; currency: string; email: string | null; paidAt: number | null; createdAt: number }[];
}

/**
 * Records donations so staff can see them: a row when the checkout starts,
 * marked paid (with the donor's email from Stripe) by the webhook. Without a
 * database (CHESSMATE_DB=off) donations still work, they just aren't listed.
 */
export class DonationLedger {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  async started(sessionId: string, amountCents: number, currency: string, userId: string | null) {
    await insertDonation(this.db, { stripeSessionId: sessionId, amountCents, currency, userId, status: 'pending', createdAt: new Date(this.now()) });
  }

  /** Returns true when the event was about a donation. Safe to receive twice. */
  async handleStripeEvent(event: StripeEvent): Promise<boolean> {
    const obj = event.data.object;
    const sessionId = typeof obj.id === 'string' ? obj.id : '';
    const meta = (obj.metadata ?? {}) as Record<string, unknown>;
    if (!sessionId || meta.kind !== 'donation') return false;
    const row = await donationBySession(this.db, sessionId);
    if (!row) return true;
    const details = (obj.customer_details ?? {}) as Record<string, unknown>;
    const email = typeof details.email === 'string' ? details.email : null;
    const paid = obj.payment_status === 'paid';
    if ((event.type === 'checkout.session.completed' && paid) || event.type === 'checkout.session.async_payment_succeeded') {
      if (row.status !== 'paid') await updateDonation(this.db, sessionId, { status: 'paid', paidAt: new Date(this.now()), email });
    } else if (event.type === 'checkout.session.async_payment_failed') {
      if (row.status !== 'paid') await updateDonation(this.db, sessionId, { status: 'failed' });
    } else if (event.type === 'checkout.session.expired') {
      if (row.status === 'pending') await updateDonation(this.db, sessionId, { status: 'expired' });
    }
    return true;
  }

  async totals(): Promise<DonationTotals> {
    const rows = await paidDonations(this.db, { limit: 5000 });
    const since = this.now() - 30 * 86_400_000;
    const add = (into: DonationTotals['last30'], cur: string, cents: number) => {
      const t = (into[cur] ??= { cents: 0, count: 0 });
      t.cents += cents;
      t.count++;
    };
    const out: DonationTotals = { last30: {}, allTime: {}, recent: [] };
    for (const r of rows) {
      add(out.allTime, r.currency, r.amountCents);
      if (r.createdAt.getTime() >= since) add(out.last30, r.currency, r.amountCents);
    }
    out.recent = rows.slice(0, 100).map((r) => ({ id: r.id, amountCents: r.amountCents, currency: r.currency, email: r.email, paidAt: r.paidAt?.getTime() ?? null, createdAt: r.createdAt.getTime() }));
    return out;
  }
}

/**
 * Donations through Stripe Checkout:
 *
 *   GET  /api/donate                                   { enabled, shown, min, max, currencies }
 *
 * `enabled`: Stripe is set up. `shown`: staff want the Support us entry in the app (Admin → Payments).
 *   POST /api/donate   { amountCents, currency, returnUrl }  → { url }  (open it to pay)
 *
 * Without STRIPE_SECRET_KEY donations are switched off and the page says so.
 */
export function donateRoutes(stripe: StripeClient | null, opts: { ledger?: DonationLedger | null; userOf?: (token: string) => string | null; support?: SupportSwitch } = {}): HttpRoute {
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
    if (req.method === 'GET') return json(200, { enabled: !!stripe, shown: opts.support?.shown ?? true, ...DONATION });
    if (req.method !== 'POST') return json(405, { error: 'GET or POST' });
    if (!stripe) return json(503, { error: 'Donations are not open yet' });
    const b = await readJson(req);
    const amount = Math.round(Number(b.amountCents));
    const currency = String(b.currency ?? 'eur').toLowerCase();
    const back = typeof b.returnUrl === 'string' && /^https?:\/\//.test(b.returnUrl) ? b.returnUrl.replace(/[?#].*$/, '') : null;
    if (!Number.isFinite(amount) || amount < DONATION.min || amount > DONATION.max) return json(400, { error: 'Choose an amount between 2 and 500' });
    if (!(DONATION.currencies as readonly string[]).includes(currency)) return json(400, { error: 'Unsupported currency' });
    if (!back) return json(400, { error: 'Missing return address' });
    const auth = req.headers.authorization;
    const userId = auth?.startsWith('Bearer ') ? (opts.userOf?.(auth.slice(7).trim()) ?? null) : null;
    try {
      const session = await stripe.createCheckout({
        amountCents: amount,
        currency,
        productName: 'Donation to ChessMate',
        submitType: 'donate',
        successUrl: `${back}?donated=1`,
        cancelUrl: back,
        metadata: { kind: 'donation', ...(userId ? { userId } : {}) },
      });
      if (opts.ledger) await opts.ledger.started(session.id, amount, currency, userId).catch((e) => console.warn('could not record donation', e));
      return json(200, { url: session.url });
    } catch (e) {
      console.error('donation checkout failed', e);
      return json(502, { error: 'Could not reach the payment provider. Try again.' });
    }
  };
}
