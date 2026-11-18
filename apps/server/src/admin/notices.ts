import type { NotificationService } from '../notifications';
import { escapeHtml, type EmailSender } from '../email';

/**
 * A player's Messages inbox, for messages from ChessMate staff. Implemented
 * by the messages service (system messages); `send` stores the message, shows
 * it in the inbox and notifies the player in the app.
 */
export interface SystemMessageSink {
  send(userId: string, msg: { title: string; body: string; category: string; data?: Record<string, string> }): Promise<void> | void;
}

/** What a staff action tells the player. */
export interface AccountNotice {
  /** fair_play | moderation */
  category: 'fair_play' | 'moderation';
  title: string;
  body: string;
  /** In-app deep link. */
  url: string | null;
  data: Record<string, string>;
  email: { subject: string; text: string };
}

export interface NoticeRecipient {
  id: string;
  username: string;
  email: string | null;
}

/**
 * Tells a player about a staff decision on their account, on every channel:
 * a message in their inbox (which also raises an in-app/push notification)
 * or, while no inbox is wired, an account notification; plus an email when
 * the account has an address. Failures are logged, never thrown, so a mail
 * outage cannot undo a moderation action.
 */
export class AccountNotifier {
  systemMessages: SystemMessageSink | null = null;

  constructor(
    private readonly notifications: () => NotificationService,
    private readonly email: EmailSender,
    private readonly log: (m: string) => void,
  ) {}

  async tell(to: NoticeRecipient, n: AccountNotice): Promise<void> {
    const data = { ...n.data, category: n.category, ...(n.url ? { url: n.url } : {}) };
    try {
      if (this.systemMessages) {
        await this.systemMessages.send(to.id, { title: n.title, body: n.body, category: n.category, data });
      } else {
        this.notifications().notify(to.id, { kind: 'system', title: n.title, body: n.body, url: n.url, data });
      }
    } catch (e) {
      this.log(`could not notify ${to.username} in the app: ${String(e)}`);
      // Fall back to a plain notification so the player still hears about it.
      if (this.systemMessages) {
        try {
          this.notifications().notify(to.id, { kind: 'system', title: n.title, body: n.body, url: n.url, data });
        } catch {
          /* logged above */
        }
      }
    }
    if (!to.email) return;
    try {
      await this.email.send({ to: to.email, subject: n.email.subject, text: n.email.text, html: toHtml(n.email.text), tag: n.category });
    } catch (e) {
      this.log(`could not email ${to.username}: ${String(e)}`);
    }
  }
}

const SIGN_OFF = '\n\nThe ChessMate team';
const SUPPORT = 'If you think this is a mistake, reply to this email to appeal.';

/* ---------------------------------------------------------------- templates */

export function warningNotice(p: { username: string; category: string; message: string }): AccountNotice {
  const fairPlay = p.category === 'cheating';
  const title = fairPlay ? 'Fair play warning' : 'Warning from ChessMate moderators';
  return {
    category: fairPlay ? 'fair_play' : 'moderation',
    title,
    body: p.message,
    url: '/notifications',
    data: { action: 'warning', warningCategory: p.category },
    email: {
      subject: fairPlay ? 'A fair play warning on your ChessMate account' : 'A warning on your ChessMate account',
      text:
        `Hi ${p.username},\n\n` +
        `${fairPlay ? 'Our fair play team' : 'A ChessMate moderator'} has issued a formal warning on your account:\n\n` +
        `"${p.message}"\n\n` +
        (fairPlay
          ? 'Using engines, other software or another person\'s help during a game is not allowed. If it happens again, your account will be closed for online play and your opponents will get their rating points back.'
          : 'Warnings stay on your account record. Repeated problems can lead to a chat ban or account closure.') +
        `\n\n${SUPPORT}${SIGN_OFF}`,
    },
  };
}

export function closedNotice(p: { username: string; reason: string }): AccountNotice {
  if (p.reason === 'fair_play') {
    const body =
      'Our fair play team reviewed your games and found they broke the fair play policy. Online play is now turned off for this account. You can still sign in to read your messages and review past games. Opponents you beat get their rating points back.';
    return {
      category: 'fair_play',
      title: 'Account restricted for fair play',
      body,
      url: '/notifications',
      data: { action: 'closed', reason: p.reason },
      email: {
        subject: 'Your ChessMate account was closed for a fair play violation',
        text: `Hi ${p.username},\n\n${body}\n\n${SUPPORT}${SIGN_OFF}`,
      },
    };
  }
  const why: Record<string, string> = {
    abuse: 'repeated abusive behaviour toward other players',
    multiple_accounts: 'using more than one account',
    requested: 'your request',
  };
  const because = why[p.reason] ? ` because of ${why[p.reason]}` : '';
  const body = `Your ChessMate account has been closed${because}. You can no longer sign in or play.`;
  return {
    category: 'moderation',
    title: 'Account closed',
    body,
    url: null,
    data: { action: 'closed', reason: p.reason },
    email: {
      subject: 'Your ChessMate account was closed',
      text: `Hi ${p.username},\n\n${body}\n\n${p.reason === 'requested' ? 'If you did not ask for this, contact support.' : SUPPORT}${SIGN_OFF}`,
    },
  };
}

export function reopenedNotice(p: { username: string; previousReason: string | null }): AccountNotice {
  const fairPlay = p.previousReason === 'fair_play';
  const body = fairPlay
    ? 'Your appeal was accepted and the fair play restriction on your account has been lifted. Online play is turned back on. Welcome back.'
    : 'Your ChessMate account has been reopened. You can sign in and play again.';
  return {
    category: fairPlay ? 'fair_play' : 'moderation',
    title: fairPlay ? 'Fair play restriction lifted' : 'Account reopened',
    body,
    url: '/play',
    data: { action: 'reopened' },
    email: {
      subject: fairPlay ? 'Your ChessMate account can play again' : 'Your ChessMate account was reopened',
      text: `Hi ${p.username},\n\n${body}${SIGN_OFF}`,
    },
  };
}

function toHtml(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return (
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px">' +
    '<div style="font-weight:700;font-size:18px;letter-spacing:.5px;margin-bottom:20px">ChessMate</div>' +
    paras +
    '</div>'
  );
}
