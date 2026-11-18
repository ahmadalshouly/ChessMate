import type { EmailSender } from '../email';

export interface Mailer {
  sendPasswordReset(to: { email: string; username: string }, token: string): Promise<void>;
}

/**
 * Development mailer: prints the reset link to the server console. Swap for a
 * real provider (SES, Postmark, Resend...) in production.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly webBaseUrl = process.env.APP_WEB_URL ?? 'http://localhost:8081') {}
  async sendPasswordReset(to: { email: string; username: string }, token: string) {
    const q = `token=${encodeURIComponent(token)}`;
    console.log(
      `[auth] Password reset for ${to.username} <${to.email}>\n` +
        `       app: chessmate://reset-password?${q}\n` +
        `       web: ${this.webBaseUrl}/reset-password?${q}`,
    );
  }
}

/** Sends the reset link as a real email through the configured provider (EMAIL_PROVIDER). */
export class EmailMailer implements Mailer {
  constructor(
    private readonly sender: EmailSender,
    private readonly webBaseUrl = process.env.APP_WEB_URL ?? 'http://localhost:8081',
  ) {}
  async sendPasswordReset(to: { email: string; username: string }, token: string) {
    const link = `${this.webBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.sender.send({
      to: to.email,
      subject: 'Reset your ChessMate password',
      text: `Hi ${to.username},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n\n${link}\n\nIf you did not ask for this, you can ignore this email.\n\nThe ChessMate team`,
      tag: 'password_reset',
    });
  }
}
