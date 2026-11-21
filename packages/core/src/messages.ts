import type { SocialUser } from './social';

/** Longest message a player can send. */
export const MESSAGE_MAX = 1000;
/** Key of the thread with messages from ChessMate staff and announcements. */
export const STAFF_THREAD = 'staff';

export type MessageKind = 'user' | 'staff' | 'broadcast';

export interface MessageView {
  id: string;
  /** Sender account id. */
  from: string;
  to: string;
  body: string;
  kind: MessageKind;
  createdAt: number;
  readAt: number | null;
  /** Sent by the viewer. */
  mine: boolean;
}

export interface ConversationSummary {
  /** The other player's id, or STAFF_THREAD. */
  key: string;
  /** The other player; null for the staff thread. */
  user: SocialUser | null;
  last: MessageView;
  unread: number;
}

/** Trims and checks a message body; returns the clean text or an error. */
export function cleanMessage(input: unknown): { body: string } | { error: string } {
  if (typeof input !== 'string') return { error: 'Write a message' };
  const body = input.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
  if (!body) return { error: 'Write a message' };
  if (body.length > MESSAGE_MAX) return { error: `Messages can be at most ${MESSAGE_MAX} characters` };
  return { body };
}
