import { createHmac } from 'node:crypto';

import { openDb, listAudit, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import type { AccountNotice } from '../src/auth/mailer';
import { DonationLedger, SupportSwitch, donateRoutes } from '../src/payments/donate';
import type { StripeClient } from '../src/payments/stripe';
import { stripeWebhookRoute } from '../src/payments/webhook';
import { ChessServer } from '../src/server';
import { sponsorshipRoutes } from '../src/sponsors/http';
import { SponsorDesk } from '../src/sponsors/service';
import { tournamentStripeHandler } from '../src/tournaments/http';
import { TournamentService } from '../src/tournaments/service';

const SECRET = 'test-secret-test-secret-test-secret!';
const WHSEC = 'whsec_test_sponsors';
const PASSWORD = 'correct horse battery';

let h: DbHandle;
let auth: AuthService;
let server: ChessServer;
let base: string;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
const mail: { to: string; notice: AccountNotice }[] = [];

/** A Stripe that records what it was asked and hands out fake links. */
const stripeCalls: { kind: string; input: unknown }[] = [];
let n = 0;
const fakeStripe: StripeClient = {
  async createCheckout(input) {
    stripeCalls.push({ kind: 'checkout', input });
    n++;
    return { id: `cs_${n}`, url: `https://checkout.stripe.test/cs_${n}` };
  },
  async createPaymentLink(input) {
    stripeCalls.push({ kind: 'link', input });
    n++;
    return { id: `plink_${n}`, url: `https://buy.stripe.test/plink_${n}` };
  },
  async deactivatePaymentLink(id) {
    stripeCalls.push({ kind: 'deactivate', input: id });
  },
};

async function signup(username: string) {
  const r = await auth.signup({ username, email: `${username}@example.com`, password: PASSWORD });
  tokens[username] = r.tokens.accessToken;
  ids[username] = r.user.id;
}

async function call(as: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens[as]}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function pub(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** Sends a signed Stripe event to the webhook. */
async function webhook(type: string, object: Record<string, unknown>, secret = WHSEC) {
  const raw = JSON.stringify({ id: `evt_${type}`, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const res = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' }, body: raw });
  return res.status;
}

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'carol']) await signup(u);
  const admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner']);
  const tournaments = new TournamentService({ db: h.db, stripe: fakeStripe });
  await tournaments.load();
  admin.tournaments = tournaments;
  const desk = new SponsorDesk({
    db: h.db,
    stripe: fakeStripe,
    webUrl: 'https://chessmate.test',
    staffInbox: 'team@chessmate.test',
    sendEmail: async (to, notice) => void mail.push({ to: to.email, notice }),
    log: () => {},
  });
  tournaments.onSponsorApplication = (row) => desk.welcome(row);
  admin.sponsorDesk = desk;
  const donations = new DonationLedger(h.db);
  admin.donations = donations;
  const support = await new SupportSwitch(h.db).load();
  admin.support = support;
  const userOf = (t: string) => auth.verifyAccessToken(t)?.userId ?? null;
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    tournaments,
    http: [
      authRoutes(auth, { rateLimit: false }),
      donateRoutes(fakeStripe, { ledger: donations, userOf, support }),
      stripeWebhookRoute([(e) => desk.handleStripeEvent(e), (e) => donations.handleStripeEvent(e), tournamentStripeHandler(tournaments)]),
      sponsorshipRoutes(desk, userOf),
    ],
    resolveUser: userOf,
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
  await call('owner', 'POST', `/players/${ids.mod}/role`, { role: 'moderator' });
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

let token = '';
let appId = '';

describe('sponsor conversations', () => {
  it('gives the applicant a private page and emails them its link', async () => {
    const r = await pub('POST', '/api/sponsors', { name: 'Dana Reed', email: 'dana@acme.example', company: 'Acme', spot: 'home.top', message: 'We would like the top of the home feed.' }, tokens.carol);
    expect(r.status).toBe(200);
    token = r.body.token;
    expect(token).toMatch(/^[\w-]{40,}$/);
    await new Promise((ok) => setTimeout(ok, 20));
    const welcome = mail.find((m) => m.to === 'dana@acme.example');
    expect(welcome?.notice.body).toContain(`https://chessmate.test/sponsorship/${token}`);

    const page = await pub('GET', `/api/sponsorship/${token}`);
    expect(page.status).toBe(200);
    expect(page.body.sponsorship).toMatchObject({ company: 'Acme', spot: 'home.top', status: 'new', messages: [], payments: [] });
    // A made-up token opens nothing.
    expect((await pub('GET', '/api/sponsorship/not-a-real-token-at-all-xxxxxxxx')).status).toBe(404);

    // Applied while signed in, so it is also listed on their account.
    const mine = await pub('GET', '/api/sponsorship/mine', undefined, tokens.carol);
    expect(mine.body.sponsorships).toEqual([expect.objectContaining({ token, company: 'Acme' })]);
    expect((await pub('GET', '/api/sponsorship/mine')).status).toBe(401);
  });

  it('lets staff and the company write to each other, with unread counts', async () => {
    const list = await call('owner', 'GET', '/sponsors');
    appId = list.body.applications[0].id;
    const sent = await call('owner', 'POST', `/sponsors/${appId}/message`, { body: 'Hi Dana, the top spot is free from Monday.' });
    expect(sent.status).toBe(200);
    expect(sent.body.thread.messages).toEqual([expect.objectContaining({ from: 'staff', author: 'owner', body: 'Hi Dana, the top spot is free from Monday.' })]);
    expect(sent.body.thread.portalUrl).toBe(`https://chessmate.test/sponsorship/${token}`);
    expect(mail.some((m) => m.to === 'dana@acme.example' && m.notice.body.includes('the top spot is free'))).toBe(true);
    // A first answer moves a new application to "contacted".
    expect((await call('owner', 'GET', '/sponsors')).body.applications[0].status).toBe('contacted');

    const reply = await pub('POST', `/api/sponsorship/${token}/messages`, { body: 'Great, what does a month cost?' });
    expect(reply.status).toBe(200);
    expect(reply.body.sponsorship.messages.map((m: { from: string }) => m.from)).toEqual(['staff', 'applicant']);
    expect(mail.some((m) => m.to === 'team@chessmate.test' && m.notice.subject.includes('Acme'))).toBe(true);
    expect((await pub('POST', `/api/sponsorship/${token}/messages`, { body: '   ' })).status).toBe(400);

    expect((await call('owner', 'GET', '/sponsors')).body.applications[0].desk).toMatchObject({ unread: 1 });
    await call('owner', 'GET', `/sponsors/${appId}/thread`);
    expect((await call('owner', 'GET', '/sponsors')).body.applications[0].desk).toMatchObject({ unread: 0 });

    // Moderators can't open sponsor conversations (tournaments are an admin job).
    expect((await call('mod', 'GET', `/sponsors/${appId}/thread`)).status).toBe(403);
  });
});

describe('sponsor payment links', () => {
  let linkId = '';
  it('sends a Stripe payment link into the conversation and emails it', async () => {
    expect((await call('owner', 'POST', `/sponsors/${appId}/payment`, { amountCents: 50, currency: 'eur', description: 'Too cheap' })).status).toBe(400);
    expect((await call('mod', 'POST', `/sponsors/${appId}/payment`, { amountCents: 30000, currency: 'eur', description: 'Home top, one month' })).status).toBe(403);
    const r = await call('owner', 'POST', `/sponsors/${appId}/payment`, { amountCents: 30000, currency: 'eur', description: 'Home top, one month' });
    expect(r.status).toBe(200);
    const p = r.body.thread.payments[0];
    expect(p).toMatchObject({ amountCents: 30000, currency: 'eur', status: 'open', createdBy: 'owner' });
    expect(p.url).toMatch(/^https:\/\/buy\.stripe\.test\//);
    linkId = p.url.split('/').pop();
    const asked = stripeCalls.find((c) => c.kind === 'link')!.input as { metadata: Record<string, string>; redirectUrl: string };
    expect(asked.metadata).toMatchObject({ kind: 'sponsor', applicationId: appId });
    expect(asked.redirectUrl).toBe(`https://chessmate.test/sponsorship/${token}?paid=1`);
    expect(mail.some((m) => m.to === 'dana@acme.example' && m.notice.body.includes(p.url) && m.notice.subject.includes('€300'))).toBe(true);
    expect((await listAudit(h.db, {})).some((e) => e.action === 'sponsor.payment_link')).toBe(true);

    // The company sees it, with the link, on their page.
    const page = await pub('GET', `/api/sponsorship/${token}`);
    expect(page.body.sponsorship.payments[0]).toMatchObject({ status: 'open', url: p.url });
    expect(page.body.sponsorship.payments[0].createdBy).toBeUndefined();
  });

  it('marks it paid from the signed webhook, switches the link off, and tells both sides', async () => {
    expect(await webhook('checkout.session.completed', { id: 'cs_paid', payment_link: linkId, payment_status: 'paid' }, 'whsec_wrong')).toBe(400);
    expect(await webhook('checkout.session.completed', { id: 'cs_paid', payment_link: linkId, payment_status: 'paid' })).toBe(200);
    // Stripe retries: a second delivery changes nothing.
    expect(await webhook('checkout.session.completed', { id: 'cs_paid', payment_link: linkId, payment_status: 'paid' })).toBe(200);
    const page = await pub('GET', `/api/sponsorship/${token}`);
    expect(page.body.sponsorship.payments[0]).toMatchObject({ status: 'paid', url: null });
    expect(page.body.sponsorship.messages.filter((m: { body: string }) => m.body.startsWith('Payment received')).length).toBe(1);
    expect(stripeCalls.filter((c) => c.kind === 'deactivate' && c.input === linkId).length).toBe(1);
    expect(mail.some((m) => m.to === 'dana@acme.example' && m.notice.subject === 'Payment received: €300')).toBe(true);
    expect((await call('owner', 'GET', '/sponsors')).body.applications[0].desk).toMatchObject({ paidCents: 30000, paidCurrency: 'eur', openPayments: 0 });
    // A paid link can't be withdrawn (that's a refund, done in Stripe).
    const paidId = page.body.sponsorship.payments[0].id;
    expect((await call('owner', 'POST', `/sponsors/${appId}/cancel-payment`, { paymentId: paidId })).status).toBe(409);
  });

  it('withdraws an unpaid link', async () => {
    const r = await call('owner', 'POST', `/sponsors/${appId}/payment`, { amountCents: 5000, currency: 'usd', description: 'Extra week' });
    const p = r.body.thread.payments[0];
    const c = await call('owner', 'POST', `/sponsors/${appId}/cancel-payment`, { paymentId: p.id });
    expect(c.status).toBe(200);
    expect(c.body.thread.payments[0]).toMatchObject({ id: p.id, status: 'canceled', url: null });
    expect(stripeCalls.at(-1)).toEqual({ kind: 'deactivate', input: p.url.split('/').pop() });
  });

  it('lists every link on the Payments page, for admins only', async () => {
    const r = await call('owner', 'GET', '/payments');
    expect(r.status).toBe(200);
    expect(r.body.sponsorPayments.map((p: { status: string }) => p.status).sort()).toEqual(['canceled', 'paid']);
    expect(r.body.sponsorPayments[0].sponsor).toBe('Acme');
    expect((await call('mod', 'GET', '/payments')).status).toBe(403);
  });
});

describe('donations', () => {
  it('records a donation and marks it paid from the webhook', async () => {
    const r = await pub('POST', '/api/donate', { amountCents: 1500, currency: 'usd', returnUrl: 'https://chessmate.test/donate?x=1' }, tokens.carol);
    expect(r.status).toBe(200);
    const checkout = stripeCalls.filter((c) => c.kind === 'checkout').at(-1)!.input as { submitType: string; successUrl: string; metadata: Record<string, string> };
    expect(checkout).toMatchObject({ submitType: 'donate', successUrl: 'https://chessmate.test/donate?donated=1', metadata: { kind: 'donation', userId: ids.carol } });
    const sessionId = r.body.url.split('/').pop();
    expect((await call('owner', 'GET', '/payments')).body.donations.recent).toEqual([]);
    await webhook('checkout.session.completed', { id: sessionId, payment_status: 'paid', metadata: { kind: 'donation' }, customer_details: { email: 'fan@example.com' } });
    const d = (await call('owner', 'GET', '/payments')).body.donations;
    expect(d.allTime.usd).toEqual({ cents: 1500, count: 1 });
    expect(d.last30.usd).toEqual({ cents: 1500, count: 1 });
    expect(d.recent[0]).toMatchObject({ amountCents: 1500, currency: 'usd', email: 'fan@example.com' });
  });

  it('refuses amounts out of range', async () => {
    expect((await pub('POST', '/api/donate', { amountCents: 100, currency: 'eur', returnUrl: 'https://x.test/donate' })).status).toBe(400);
    expect((await pub('POST', '/api/donate', { amountCents: 500, currency: 'jpy', returnUrl: 'https://x.test/donate' })).status).toBe(400);
  });
});

describe('Support us switch', () => {
  it('lets admins hide and show Support us in the app, and remembers it', async () => {
    expect((await pub('GET', '/api/donate')).body.shown).toBe(true);
    expect((await call('mod', 'POST', '/payments/support', { shown: false })).status).toBe(403);
    expect((await call('owner', 'POST', '/payments/support', { shown: 'no' })).status).toBe(400);
    expect((await call('owner', 'POST', '/payments/support', { shown: false })).body).toEqual({ shown: false });
    expect((await pub('GET', '/api/donate')).body.shown).toBe(false);
    expect((await call('owner', 'GET', '/payments')).body.supportShown).toBe(false);
    // Survives a restart: a fresh switch reads it back from the database.
    expect((await new SupportSwitch(h.db).load()).shown).toBe(false);
    await call('owner', 'POST', '/payments/support', { shown: true });
    expect((await pub('GET', '/api/donate')).body.shown).toBe(true);
  });
});
