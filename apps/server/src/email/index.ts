/**
 * Outgoing email behind one small interface, so features never talk to a
 * provider directly.
 *
 *   EMAIL_PROVIDER=log      (default) print each email to the server console
 *   EMAIL_PROVIDER=resend   send through Resend's HTTP API; needs RESEND_API_KEY
 *   EMAIL_FROM              sender, e.g. "ChessMate <no-reply@chessmate.app>"
 *
 * With `resend` chosen but no key set, the server falls back to the console
 * and says so once at startup. Add another provider by implementing
 * `EmailSender` and a case in `emailSenderFromEnv`.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body. Always sent; the HTML part is optional. */
  text: string;
  html?: string;
  /** Provider tag for filtering in its dashboard, e.g. "fair_play". */
  tag?: string;
}

export interface EmailSender {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

/** Development sender: prints the email instead of sending it. */
export class LogEmailSender implements EmailSender {
  readonly name = 'log';
  readonly sent: EmailMessage[] = [];
  constructor(private readonly print: (line: string) => void = (l) => console.log(l)) {}
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    if (this.sent.length > 100) this.sent.shift();
    this.print(`[email] to ${msg.to}: ${msg.subject}\n${msg.text.replace(/^/gm, '        ')}`);
  }
}

/** Resend (resend.com) over its REST API; no SDK needed. */
export class ResendEmailSender implements EmailSender {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(msg: EmailMessage) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.tag ? { tags: [{ name: 'category', value: msg.tag }] } : {}),
      }),
    });
    if (!res.ok) throw new Error(`resend answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
}

export const DEFAULT_FROM = 'ChessMate <no-reply@chessmate.app>';

export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.warn): EmailSender {
  const provider = (env.EMAIL_PROVIDER ?? 'log').toLowerCase();
  const from = env.EMAIL_FROM || DEFAULT_FROM;
  if (provider === 'resend') {
    if (env.RESEND_API_KEY) return new ResendEmailSender(env.RESEND_API_KEY, from);
    log('[email] EMAIL_PROVIDER=resend but RESEND_API_KEY is not set: printing emails to the console instead');
  } else if (provider !== 'log') {
    log(`[email] unknown EMAIL_PROVIDER "${provider}": printing emails to the console instead`);
  }
  return new LogEmailSender();
}

/** Minimal HTML escaping for the HTML part of templated emails. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
