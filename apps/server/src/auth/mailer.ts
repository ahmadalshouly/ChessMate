export interface AccountNotice {
  subject: string;
  /** Plain text; paragraphs separated by blank lines. */
  body: string;
}

export interface Mailer {
  sendPasswordReset(to: { email: string; username: string }, token: string): Promise<void>;
  /** Moderation and account messages (warnings, mutes, bans, closures). Optional so simple test mailers still fit. */
  sendAccountNotice?(to: { email: string; username: string }, notice: AccountNotice): Promise<void>;
}

function resetLinks(webBaseUrl: string, token: string) {
  const q = `token=${encodeURIComponent(token)}`;
  return { app: `chessmate://reset-password?${q}`, web: `${webBaseUrl}/reset-password?${q}` };
}

/**
 * Development mailer: prints the messages to the server console. Production
 * uses `ResendMailer` when RESEND_API_KEY and MAIL_FROM are set (see mailerFromEnv).
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly webBaseUrl = process.env.APP_WEB_URL ?? 'http://localhost:8081') {}
  async sendPasswordReset(to: { email: string; username: string }, token: string) {
    const links = resetLinks(this.webBaseUrl, token);
    console.log(`[auth] Password reset for ${to.username} <${to.email}>\n` + `       app: ${links.app}\n` + `       web: ${links.web}`);
  }
  async sendAccountNotice(to: { email: string; username: string }, notice: AccountNotice) {
    console.log(`[mail] To ${to.username} <${to.email}>: ${notice.subject}\n       ${notice.body.replace(/\n/g, '\n       ')}`);
  }
}

/** Sends email through Resend's HTTP API (https://resend.com). No SDK needed. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly webBaseUrl = process.env.APP_WEB_URL ?? 'http://localhost:8081',
    private readonly log: (msg: string) => void = console.warn,
  ) {}

  private async send(to: string, subject: string, text: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, text }),
    });
    if (!res.ok) this.log(`[mail] could not send "${subject}" (${res.status})`);
  }

  async sendPasswordReset(to: { email: string; username: string }, token: string) {
    const links = resetLinks(this.webBaseUrl, token);
    await this.send(
      to.email,
      'Reset your ChessMate password',
      `Hi ${to.username},\n\nOpen this link to choose a new password:\n${links.web}\n\nOn your phone you can also use:\n${links.app}\n\nIf you did not ask for this, ignore this email.`,
    );
  }

  async sendAccountNotice(to: { email: string; username: string }, notice: AccountNotice) {
    await this.send(to.email, notice.subject, `Hi ${to.username},\n\n${notice.body}\n\nThe ChessMate team`);
  }
}

/** Real email when RESEND_API_KEY and MAIL_FROM are set, otherwise the console. */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.RESEND_API_KEY && env.MAIL_FROM) return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  return new ConsoleMailer();
}
