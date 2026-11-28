import { randomBytes } from 'node:crypto';

import {
  cleanSponsorMessage,
  formatMoney,
  isAdSpot,
  validateSponsorPayment,
  type SponsorDeskSummary,
  type SponsorMessageFrom,
  type SponsorMessageView,
  type SponsorPaymentStatus,
  type SponsorPaymentView,
  type SponsorPortalView,
  type SponsorshipListItem,
  type SponsorStatus,
} from '@chessmate/core';
import {
  insertSponsorMessage,
  insertSponsorPayment,
  recentSponsorPayments,
  sponsorApplicationById,
  sponsorApplicationByToken,
  sponsorApplicationsOfUser,
  sponsorMessagesFor,
  sponsorMessagesOf,
  sponsorPaymentById,
  sponsorPaymentByLink,
  sponsorPaymentsFor,
  sponsorPaymentsOf,
  updateSponsorApplication,
  updateSponsorPayment,
  type Database,
  type SponsorApplication,
  type SponsorMessage,
  type SponsorPayment,
} from '@chessmate/db';

import type { AccountNotice } from '../auth/mailer';
import type { StripeClient, StripeEvent } from '../payments/stripe';
import { sponsorMessageEmail, sponsorPaidEmail, sponsorPaymentEmail, sponsorReplyEmail, sponsorWelcomeEmail } from './emails';

export class SponsorDeskError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A conversation as staff see it. */
export interface SponsorThread {
  messages: SponsorMessageView[];
  payments: SponsorPaymentView[];
  /** The company's own page, to copy into an email or chat. */
  portalUrl: string | null;
  paymentsEnabled: boolean;
}

export interface SponsorDeskDeps {
  db: Database;
  stripe: StripeClient | null;
  /** Sends an email to an address (the applicant's, or the staff inbox). Failures are logged, never thrown. */
  sendEmail?: (to: { email: string; username: string }, notice: AccountNotice) => Promise<void>;
  /** The web app, for links in emails and Stripe's redirect: APP_WEB_URL. */
  webUrl?: string;
  /** Where to email staff when a company replies: SPONSOR_INBOX_EMAIL. Optional. */
  staffInbox?: string | null;
  now?: () => number;
  log?: (msg: string) => void;
}

/** An applicant can write at most this many messages an hour (stops a leaked link being used to flood staff). */
const APPLICANT_MESSAGES_PER_HOUR = 20;
const ms = (d: Date | null | undefined) => (d ? d.getTime() : 0);

/**
 * Staff and sponsor applicants (companies that applied for a tournament or an
 * ad spot) talking about one application, and the Stripe payment links staff
 * send them. The company follows everything on `/sponsorship/<token>`, which
 * needs no account; the token is a 32-byte secret made when they apply.
 *
 * Payment links are Stripe Payment Links (they don't expire, unlike Checkout
 * Sessions) limited to one payment. The webhook marks them paid and switches
 * them off.
 */
export class SponsorDesk {
  private readonly db: Database;
  private readonly stripe: StripeClient | null;
  private readonly sendEmail: SponsorDeskDeps['sendEmail'];
  private readonly webUrl: string;
  private readonly staffInbox: string | null;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private notify: ((userId: string, title: string, body: string, url: string) => void) | null = null;

  constructor(deps: SponsorDeskDeps) {
    this.db = deps.db;
    this.stripe = deps.stripe;
    this.sendEmail = deps.sendEmail;
    this.webUrl = (deps.webUrl ?? process.env.APP_WEB_URL ?? 'http://localhost:8081').replace(/\/+$/, '');
    this.staffInbox = deps.staffInbox ?? null;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? ((m) => console.warn(m));
  }

  /** In-app notifications for applicants who applied while signed in. */
  attach(notify: (userId: string, title: string, body: string, url: string) => void) {
    this.notify = notify;
  }

  get paymentsEnabled(): boolean {
    return !!this.stripe;
  }

  static newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  portalPath(token: string): string {
    return `/sponsorship/${token}`;
  }

  portalUrl(token: string): string {
    return `${this.webUrl}${this.portalPath(token)}`;
  }

  // ---------------------------------------------------------------- applying

  /** Right after someone applies: email them the link to follow their application. */
  async welcome(a: SponsorApplication): Promise<void> {
    if (!a.accessToken) return;
    await this.mail(a, sponsorWelcomeEmail(a, this.spotLabel(a), this.portalUrl(a.accessToken)));
  }

  // ---------------------------------------------------------------- staff

  /** Unread counts and payment totals for the console's list. */
  async summaries(apps: SponsorApplication[]): Promise<Map<string, SponsorDeskSummary>> {
    const ids = apps.map((a) => a.id);
    const [messages, payments] = await Promise.all([sponsorMessagesFor(this.db, ids), sponsorPaymentsFor(this.db, ids)]);
    const out = new Map<string, SponsorDeskSummary>();
    for (const a of apps) out.set(a.id, { unread: 0, lastMessageAt: null, openPayments: 0, paidCents: 0, paidCurrency: null });
    const seen = new Map(apps.map((a) => [a.id, ms(a.staffSeenAt)]));
    for (const m of messages) {
      const s = out.get(m.applicationId);
      if (!s) continue;
      const at = ms(m.createdAt);
      s.lastMessageAt = Math.max(s.lastMessageAt ?? 0, at);
      if (m.sender === 'applicant' && at > (seen.get(m.applicationId) ?? 0)) s.unread++;
    }
    for (const p of payments) {
      const s = out.get(p.applicationId);
      if (!s) continue;
      if (p.status === 'open' || p.status === 'processing') s.openPayments++;
      if (p.status === 'paid' && (!s.paidCurrency || s.paidCurrency === p.currency)) {
        s.paidCents += p.amountCents;
        s.paidCurrency = p.currency;
      }
    }
    return out;
  }

  /** Opens the conversation (marks the company's messages read). */
  async staffThread(applicationId: string): Promise<SponsorThread> {
    const a = await this.app(applicationId);
    await updateSponsorApplication(this.db, a.id, { staffSeenAt: new Date(this.now()) });
    return this.thread(a);
  }

  async staffMessage(applicationId: string, staff: string, body: unknown): Promise<SponsorThread> {
    const text = cleanSponsorMessage(body);
    if (!text) throw new SponsorDeskError(400, 'Write a message first');
    const a = await this.withToken(await this.app(applicationId));
    await this.post(a, 'staff', staff, text);
    // A first reply from staff moves a new application on.
    const patch: Partial<SponsorApplication> = { staffSeenAt: new Date(this.now()), updatedAt: new Date(this.now()) };
    if (a.status === 'new') patch.status = 'contacted' satisfies SponsorStatus;
    await updateSponsorApplication(this.db, a.id, patch);
    await this.mail(a, sponsorMessageEmail(a, text, this.portalUrl(a.accessToken!)));
    this.ping(a, 'New message from the ChessMate team', text.slice(0, 140));
    return this.thread(a);
  }

  /** Makes a Stripe Payment Link, posts it in the conversation and emails it. */
  async sendPaymentLink(applicationId: string, staff: string, input: unknown): Promise<SponsorThread> {
    if (!this.stripe) throw new SponsorDeskError(503, 'Payments are not set up yet');
    const v = validateSponsorPayment(input);
    if ('error' in v) throw new SponsorDeskError(400, v.error);
    const a = await this.withToken(await this.app(applicationId));
    if (a.status === 'declined') throw new SponsorDeskError(409, 'This application was declined');
    const who = a.company ?? a.name;
    let link: { id: string; url: string };
    try {
      link = await this.stripe.createPaymentLink({
        amountCents: v.value.amountCents,
        currency: v.value.currency,
        productName: `ChessMate sponsorship: ${v.value.description}`,
        redirectUrl: `${this.portalUrl(a.accessToken!)}?paid=1`,
        metadata: { kind: 'sponsor', applicationId: a.id, sponsor: who.slice(0, 100) },
      });
    } catch (e) {
      this.log(`sponsor payment link failed: ${String(e)}`);
      throw new SponsorDeskError(502, `Stripe refused the payment link: ${e instanceof Error ? e.message : String(e)}`);
    }
    const p = await insertSponsorPayment(this.db, {
      applicationId: a.id,
      description: v.value.description,
      amountCents: v.value.amountCents,
      currency: v.value.currency,
      stripeLinkId: link.id,
      url: link.url,
      status: 'open',
      createdBy: staff,
      createdAt: new Date(this.now()),
    });
    const amount = formatMoney(p.amountCents, p.currency);
    await this.post(a, 'system', staff, `Payment link sent: ${p.description}, ${amount}.`);
    await updateSponsorApplication(this.db, a.id, { staffSeenAt: new Date(this.now()), updatedAt: new Date(this.now()), ...(a.status === 'new' ? { status: 'contacted' } : {}) });
    await this.mail(a, sponsorPaymentEmail(a, p.description, amount, link.url, this.portalUrl(a.accessToken!)));
    this.ping(a, 'Payment link from ChessMate', `${p.description}: ${amount}`);
    return this.thread(a);
  }

  /** Withdraws an unpaid link: Stripe switches it off and it can no longer be paid. */
  async cancelPayment(applicationId: string, paymentId: string, staff: string): Promise<SponsorThread> {
    const a = await this.app(applicationId);
    const p = await sponsorPaymentById(this.db, paymentId);
    if (!p || p.applicationId !== a.id) throw new SponsorDeskError(404, 'No such payment');
    if (p.status !== 'open' && p.status !== 'failed') throw new SponsorDeskError(409, p.status === 'paid' ? 'This link was already paid. Refund it in the Stripe dashboard.' : 'This link is not open');
    if (this.stripe) {
      try {
        await this.stripe.deactivatePaymentLink(p.stripeLinkId);
      } catch (e) {
        throw new SponsorDeskError(502, `Stripe could not switch the link off: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await updateSponsorPayment(this.db, p.id, { status: 'canceled', updatedAt: new Date(this.now()) });
    await this.post(a, 'system', staff, `Payment link withdrawn: ${p.description}, ${formatMoney(p.amountCents, p.currency)}.`);
    return this.thread(a);
  }

  /** Every payment link, newest first, with the company it was for (the console's Payments page). */
  async recentPayments(): Promise<(SponsorPaymentView & { applicationId: string; sponsor: string })[]> {
    const rows = await recentSponsorPayments(this.db);
    const names = new Map<string, string>();
    for (const id of new Set(rows.map((r) => r.applicationId))) {
      const a = await sponsorApplicationById(this.db, id);
      names.set(id, a ? (a.company ?? a.name) : id);
    }
    return rows.map((r) => ({ ...this.paymentView(r, true), applicationId: r.applicationId, sponsor: names.get(r.applicationId) ?? r.applicationId }));
  }

  // ---------------------------------------------------------------- the company's page

  async portal(token: string): Promise<SponsorPortalView> {
    const a = await this.byToken(token);
    await updateSponsorApplication(this.db, a.id, { applicantSeenAt: new Date(this.now()) });
    const [messages, payments] = await Promise.all([sponsorMessagesOf(this.db, a.id), sponsorPaymentsOf(this.db, a.id)]);
    return {
      company: a.company,
      name: a.name,
      spot: isAdSpot(a.spot) ? a.spot : null,
      status: a.status as SponsorStatus,
      message: a.message,
      createdAt: ms(a.createdAt),
      messages: messages.map(messageView),
      payments: payments.map((p) => this.paymentView(p, false)),
    };
  }

  async applicantMessage(token: string, body: unknown): Promise<SponsorPortalView> {
    const text = cleanSponsorMessage(body);
    if (!text) throw new SponsorDeskError(400, 'Write a message first');
    const a = await this.byToken(token);
    if (a.status === 'declined') throw new SponsorDeskError(409, 'This application is closed');
    const hourAgo = this.now() - 3_600_000;
    const recent = (await sponsorMessagesOf(this.db, a.id)).filter((m) => m.sender === 'applicant' && ms(m.createdAt) > hourAgo).length;
    if (recent >= APPLICANT_MESSAGES_PER_HOUR) throw new SponsorDeskError(429, 'Slow down: too many messages');
    await this.post(a, 'applicant', a.name, text);
    await updateSponsorApplication(this.db, a.id, { updatedAt: new Date(this.now()) });
    if (this.staffInbox && this.sendEmail) {
      try {
        await this.sendEmail({ email: this.staffInbox, username: 'ChessMate team' }, sponsorReplyEmail(a, text, `${this.webUrl}/admin/sponsors`));
      } catch (e) {
        this.log(`could not email the sponsor inbox: ${String(e)}`);
      }
    }
    return this.portal(token);
  }

  /** "Your sponsorships": applications made while signed in to this account. */
  async mine(userId: string): Promise<SponsorshipListItem[]> {
    const rows = await sponsorApplicationsOfUser(this.db, userId);
    const withTokens = await Promise.all(rows.map((r) => this.withToken(r)));
    const messages = await sponsorMessagesFor(
      this.db,
      withTokens.map((r) => r.id),
    );
    return withTokens.map((r) => ({
      token: r.accessToken!,
      company: r.company,
      name: r.name,
      status: r.status as SponsorStatus,
      createdAt: ms(r.createdAt),
      unread: messages.filter((m) => m.applicationId === r.id && m.sender !== 'applicant' && ms(m.createdAt) > ms(r.applicantSeenAt)).length,
    }));
  }

  // ---------------------------------------------------------------- Stripe

  /**
   * Webhook events for sponsor payment links. Returns true when the event was
   * about one (so other handlers can skip it). Safe to receive twice.
   */
  async handleStripeEvent(event: StripeEvent): Promise<boolean> {
    const obj = event.data.object;
    const linkId = typeof obj.payment_link === 'string' ? obj.payment_link : null;
    if (!linkId) return false;
    const p = await sponsorPaymentByLink(this.db, linkId);
    if (!p) return false;
    const sessionId = typeof obj.id === 'string' ? obj.id : null;
    const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
    switch (event.type) {
      case 'checkout.session.completed':
        if (paid) await this.markPaid(p, sessionId);
        else if (p.status === 'open') await updateSponsorPayment(this.db, p.id, { status: 'processing', stripeSessionId: sessionId, updatedAt: new Date(this.now()) });
        return true;
      case 'checkout.session.async_payment_succeeded':
        await this.markPaid(p, sessionId);
        return true;
      case 'checkout.session.async_payment_failed':
        if (p.status !== 'paid') {
          await updateSponsorPayment(this.db, p.id, { status: 'failed', updatedAt: new Date(this.now()) });
          const a = await sponsorApplicationById(this.db, p.applicationId);
          if (a) await this.post(a, 'system', null, `The bank refused the payment for ${p.description}. The team will be in touch.`);
        }
        return true;
      default:
        return true;
    }
  }

  private async markPaid(p: SponsorPayment, sessionId: string | null) {
    if (p.status === 'paid') return;
    await updateSponsorPayment(this.db, p.id, { status: 'paid' satisfies SponsorPaymentStatus, paidAt: new Date(this.now()), stripeSessionId: sessionId ?? p.stripeSessionId, updatedAt: new Date(this.now()) });
    // One payment per link: switch it off so it can't be paid twice.
    if (this.stripe) await this.stripe.deactivatePaymentLink(p.stripeLinkId).catch((e) => this.log(`could not switch off payment link ${p.stripeLinkId}: ${String(e)}`));
    const a = await sponsorApplicationById(this.db, p.applicationId);
    if (!a) return;
    const amount = formatMoney(p.amountCents, p.currency);
    await this.post(a, 'system', null, `Payment received: ${p.description}, ${amount}. Thank you!`);
    await updateSponsorApplication(this.db, a.id, { updatedAt: new Date(this.now()) });
    await this.mail(a, sponsorPaidEmail(a, p.description, amount, a.accessToken ? this.portalUrl(a.accessToken) : null));
    this.ping(a, 'Payment received', `${p.description}: ${amount}`);
    if (this.staffInbox && this.sendEmail) {
      await this.sendEmail({ email: this.staffInbox, username: 'ChessMate team' }, { subject: `Sponsor paid: ${a.company ?? a.name}, ${amount}`, body: `${a.company ?? a.name} paid ${amount} for ${p.description}.\n\n${this.webUrl}/admin/sponsors` }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- helpers

  private async app(id: string): Promise<SponsorApplication> {
    const a = await sponsorApplicationById(this.db, id);
    if (!a) throw new SponsorDeskError(404, 'No such application');
    return a;
  }

  private async byToken(token: string): Promise<SponsorApplication> {
    const a = /^[\w-]{20,100}$/.test(token) ? await sponsorApplicationByToken(this.db, token) : null;
    if (!a) throw new SponsorDeskError(404, 'This link is not valid');
    return a;
  }

  /** Applications from before this feature have no token yet: make one on first contact. */
  private async withToken(a: SponsorApplication): Promise<SponsorApplication & { accessToken: string }> {
    if (a.accessToken) return a as SponsorApplication & { accessToken: string };
    const accessToken = SponsorDesk.newToken();
    await updateSponsorApplication(this.db, a.id, { accessToken });
    return { ...a, accessToken };
  }

  private async thread(a: SponsorApplication): Promise<SponsorThread> {
    const fresh = (await sponsorApplicationById(this.db, a.id)) ?? a;
    const [messages, payments] = await Promise.all([sponsorMessagesOf(this.db, a.id), sponsorPaymentsOf(this.db, a.id)]);
    return {
      messages: messages.map(messageView),
      payments: payments.map((p) => this.paymentView(p, true)),
      portalUrl: fresh.accessToken ? this.portalUrl(fresh.accessToken) : null,
      paymentsEnabled: this.paymentsEnabled,
    };
  }

  private async post(a: SponsorApplication, from: SponsorMessageFrom, author: string | null, body: string): Promise<SponsorMessage> {
    return insertSponsorMessage(this.db, { applicationId: a.id, sender: from, author, body, createdAt: new Date(this.now()) });
  }

  private paymentView(p: SponsorPayment, staff: boolean): SponsorPaymentView {
    const live = p.status === 'open' || p.status === 'failed';
    return {
      id: p.id,
      description: p.description,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status as SponsorPaymentStatus,
      url: live ? p.url : null,
      createdAt: ms(p.createdAt),
      paidAt: p.paidAt ? ms(p.paidAt) : null,
      ...(staff ? { createdBy: p.createdBy } : {}),
    };
  }

  private spotLabel(a: SponsorApplication): string | null {
    return isAdSpot(a.spot) ? a.spot : null;
  }

  private async mail(a: SponsorApplication, notice: AccountNotice) {
    if (!this.sendEmail) return;
    try {
      await this.sendEmail({ email: a.email, username: a.company ? `${a.name} (${a.company})` : a.name }, notice);
    } catch (e) {
      this.log(`could not email sponsor ${a.email}: ${String(e)}`);
    }
  }

  private ping(a: SponsorApplication, title: string, body: string) {
    if (a.userId && a.accessToken && this.notify) this.notify(a.userId, title, body, this.portalPath(a.accessToken));
  }
}

function messageView(m: SponsorMessage): SponsorMessageView {
  return { id: m.id, from: m.sender as SponsorMessageFrom, author: m.author, body: m.body, createdAt: ms(m.createdAt) };
}
