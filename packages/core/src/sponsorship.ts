import type { AdSpotId } from './ads';
import type { SponsorStatus } from './tournaments';

/**
 * After a company applies to sponsor (a tournament or an ad spot), staff and
 * the company talk in one conversation per application and staff can send
 * Stripe payment links into it. The company follows it on its own page,
 * `/sponsorship/<token>`, which needs no account: the token in the link is the
 * key, and it is emailed to them.
 */

/** Who wrote a message: the ChessMate team, the company, or ChessMate itself (payment updates). */
export type SponsorMessageFrom = 'staff' | 'applicant' | 'system';

export interface SponsorMessageView {
  id: string;
  from: SponsorMessageFrom;
  /** Staff username, the applicant's name, or null for system lines. */
  author: string | null;
  body: string;
  createdAt: number;
}

/**
 * open: link sent, not paid yet. processing: paid by a method that takes days
 * (bank debit). paid. failed: the bank refused a delayed payment. canceled:
 * staff withdrew the link.
 */
export const SPONSOR_PAYMENT_STATUSES = ['open', 'processing', 'paid', 'failed', 'canceled'] as const;
export type SponsorPaymentStatus = (typeof SPONSOR_PAYMENT_STATUSES)[number];

export interface SponsorPaymentView {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  status: SponsorPaymentStatus;
  /** The Stripe payment page. Null once it is paid or withdrawn. */
  url: string | null;
  createdAt: number;
  paidAt: number | null;
  /** Staff who sent it (staff views only). */
  createdBy?: string | null;
}

/** What staff see next to an application in the console list. */
export interface SponsorDeskSummary {
  /** Messages from the company that staff have not opened yet. */
  unread: number;
  lastMessageAt: number | null;
  openPayments: number;
  paidCents: number;
  /** Currency of the paid total (the first paid link's). */
  paidCurrency: string | null;
}

/** The company's own page. */
export interface SponsorPortalView {
  company: string | null;
  name: string;
  spot: AdSpotId | null;
  status: SponsorStatus;
  message: string;
  createdAt: number;
  messages: SponsorMessageView[];
  payments: SponsorPaymentView[];
}

/** One line per application in "Your sponsorships", for signed-in applicants. */
export interface SponsorshipListItem {
  token: string;
  company: string | null;
  name: string;
  status: SponsorStatus;
  createdAt: number;
  unread: number;
}

/** Currencies staff can bill in. Stripe takes lowercase codes. */
export const SPONSOR_CURRENCIES = ['eur', 'usd', 'gbp'] as const;
export type SponsorCurrency = (typeof SPONSOR_CURRENCIES)[number];

/** €1 to €50,000 per link, in cents. */
export const SPONSOR_PAYMENT_LIMITS = { min: 100, max: 5_000_000 } as const;

export const SPONSOR_MESSAGE_MAX = 2000;

export function validateSponsorPayment(input: unknown): { value: { amountCents: number; currency: SponsorCurrency; description: string } } | { error: string; field: string } {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const amountCents = Math.round(Number(i.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < SPONSOR_PAYMENT_LIMITS.min || amountCents > SPONSOR_PAYMENT_LIMITS.max) return { error: 'Enter an amount between 1 and 50,000', field: 'amountCents' };
  const currency = typeof i.currency === 'string' ? i.currency.toLowerCase() : '';
  if (!(SPONSOR_CURRENCIES as readonly string[]).includes(currency)) return { error: 'Unsupported currency', field: 'currency' };
  const description = typeof i.description === 'string' ? i.description.trim().slice(0, 120) : '';
  if (description.length < 3) return { error: 'Say what the payment is for', field: 'description' };
  return { value: { amountCents, currency: currency as SponsorCurrency, description } };
}

/** Message text: trimmed, at most SPONSOR_MESSAGE_MAX characters; null when empty. */
export function cleanSponsorMessage(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().slice(0, SPONSOR_MESSAGE_MAX) : '';
  return s.length ? s : null;
}
