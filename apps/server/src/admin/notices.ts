import type { AccountNotice } from '../auth/mailer';

/**
 * What a player is told when staff act on their account. `title` and `body`
 * go to the in-app inbox (and push); the app translates the fixed ones by
 * matching this exact English text (apps/app/src/i18n/notifications.ts), so
 * keep the two in sync. `email` is the message sent to the account's address.
 */
export interface ModerationNotice {
  title: string;
  body: string;
  email: AccountNotice;
}

const CODE_OF_CONDUCT = 'If you think this is a mistake, reply to this email and a moderator will look at it again.';

export const NOTICE_TITLES = {
  warning: 'Warning from ChessMate moderators',
  muted: 'Chat turned off',
  fairPlay: 'Account closed for fair play',
  reopened: 'Account reopened',
} as const;

export const FAIR_PLAY_BODY =
  'Our fair play review found outside help in your games. You can still sign in to see your games and puzzles, but online play is turned off. Opponents got back the rating points they lost.';
export const REOPENED_BODY = 'Your account is open again. Online play is back on.';

export function warningNotice(message: string): ModerationNotice {
  return {
    title: NOTICE_TITLES.warning,
    body: message,
    email: {
      subject: 'A warning from ChessMate moderators',
      body: `A moderator sent you a warning:\n\n"${message}"\n\nThe warning is kept on your account. More warnings can lead to chat being turned off or the account being closed.\n\n${CODE_OF_CONDUCT}`,
    },
  };
}

export function muteNotice(hours: number, until: number, reason: string): ModerationNotice {
  const n = hours >= 48 ? Math.round(hours / 24) : Math.max(1, Math.round(hours));
  const span = hours >= 48 ? `${n} days` : `${n} ${n === 1 ? 'hour' : 'hours'}`;
  const when = new Date(until).toUTCString();
  return {
    title: NOTICE_TITLES.muted,
    body: `Chat is off for your account for ${span}. Reason: ${reason}`,
    email: {
      subject: 'Chat is turned off on your ChessMate account',
      body: `A moderator turned off chat on your account for ${span} (until ${when}).\n\nReason: ${reason}\n\nYou can keep playing; you just cannot send chat messages until then.\n\n${CODE_OF_CONDUCT}`,
    },
  };
}

export function fairPlayNotice(note: string | null): ModerationNotice {
  return {
    title: NOTICE_TITLES.fairPlay,
    body: FAIR_PLAY_BODY,
    email: {
      subject: 'Your ChessMate account was closed for fair play',
      body:
        `Our fair play team reviewed your games and found that moves were played with outside help, such as a chess engine.${note ? `\n\nNote from the team: ${note}` : ''}\n\n` +
        'What this means:\n- You can still sign in and see your games, puzzles and profile.\n- Online games, challenges and chat are turned off.\n- Opponents who lost rating points to you got them back.\n\n' +
        CODE_OF_CONDUCT,
    },
  };
}

/** Closures for other reasons lock the account, so only an email reaches the player. */
export function closureEmail(reason: string, note: string | null): AccountNotice {
  const why: Record<string, string> = {
    abuse: 'abusive behaviour towards other players',
    multiple_accounts: 'using more than one account',
    requested: 'your request',
  };
  return {
    subject: 'Your ChessMate account was closed',
    body: `ChessMate staff closed your account because of ${why[reason] ?? 'a breach of our rules'}.${note ? `\n\nNote from the team: ${note}` : ''}\n\nYou can no longer sign in.\n\n${CODE_OF_CONDUCT}`,
  };
}

export function reopenNotice(): ModerationNotice {
  return {
    title: NOTICE_TITLES.reopened,
    body: REOPENED_BODY,
    email: { subject: 'Your ChessMate account is open again', body: `${REOPENED_BODY}\n\nWelcome back.` },
  };
}
