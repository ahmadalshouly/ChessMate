import type { AccountNotice } from '../auth/mailer';

/**
 * Emails to sponsor applicants. The mailer adds "Hi <name>," and the sign-off,
 * so these start with the message itself. Every one carries the link to the
 * company's own page, where they can read the whole conversation and reply.
 */

type App = { name: string; company: string | null };

const pageLine = (url: string) => `Read the whole conversation and reply here:\n${url}`;

export function sponsorWelcomeEmail(a: App, spot: string | null, portalUrl: string): AccountNotice {
  return {
    subject: 'We have your ChessMate sponsorship application',
    body:
      `Thank you for applying to sponsor ChessMate${a.company ? ` with ${a.company}` : ''}.${spot ? ` You asked about the ${spot} spot.` : ''}\n\n` +
      'The team reviews every application and will answer you on your sponsorship page. Keep this email: the link is your key to that page, no account needed.\n\n' +
      portalUrl,
  };
}

export function sponsorMessageEmail(_a: App, text: string, portalUrl: string): AccountNotice {
  return {
    subject: 'New message about your ChessMate sponsorship',
    body: `The ChessMate team wrote:\n\n${text}\n\n${pageLine(portalUrl)}`,
  };
}

export function sponsorPaymentEmail(_a: App, description: string, amount: string, payUrl: string, portalUrl: string): AccountNotice {
  return {
    subject: `Payment for your ChessMate sponsorship: ${amount}`,
    body:
      `Here is the payment link for ${description}: ${amount}.\n\n` +
      `Pay securely with Stripe:\n${payUrl}\n\n` +
      'Stripe takes cards and, depending on your country, other methods. ChessMate never sees your card details.\n\n' +
      pageLine(portalUrl),
  };
}

export function sponsorPaidEmail(_a: App, description: string, amount: string, portalUrl: string | null): AccountNotice {
  return {
    subject: `Payment received: ${amount}`,
    body: `We received your payment of ${amount} for ${description}. Thank you for sponsoring ChessMate!\n\nStripe emails you a receipt separately.${portalUrl ? `\n\n${pageLine(portalUrl)}` : ''}`,
  };
}

/** To the staff inbox (SPONSOR_INBOX_EMAIL) when a company replies. */
export function sponsorReplyEmail(a: App, text: string, consoleUrl: string): AccountNotice {
  return {
    subject: `Sponsor reply: ${a.company ?? a.name}`,
    body: `${a.company ? `${a.name} (${a.company})` : a.name} wrote:\n\n${text}\n\nAnswer in the staff console:\n${consoleUrl}`,
  };
}
