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
