import { STAFF_THREAD, cleanMessage, type ConversationSummary, type MessageView, type SocialEvent, type SocialUser, type Visibility } from '@chessmate/core';
import {
  activeUserIds,
  conversation,
  getUser,
  getUsersByIds,
  insertMessage,
  insertMessages,
  latestPerConversation,
  markRead,
  pairStatus,
  staffMessagesTo,
  unreadBySender,
  type Database,
  type DirectMessage,
} from '@chessmate/db';
import type { NotificationService } from '../notifications';
import { SocialError, toSocialUser } from '../social/service';

export interface MessageServiceOptions {
  db: Database;
  /** Who may message this player: everyone, friends or nobody (Settings → Privacy). */
  privacyOf?: (userId: string) => Visibility;
  /** Staff can always message a player (and only staff send staff messages). */
  isStaff?: (userId: string) => boolean;
  now?: () => number;
}

/** Messages per sender per minute before they are asked to slow down. */
const PER_MINUTE = 20;
const PAGE = 50;

export const toView = (m: DirectMessage, viewer: string): MessageView => ({
  id: m.id,
  from: m.senderId,
  to: m.recipientId,
  body: m.body,
  kind: (m.kind as MessageView['kind']) ?? 'user',
  createdAt: new Date(m.createdAt).getTime(),
  readAt: m.readAt ? new Date(m.readAt).getTime() : null,
  mine: m.senderId === viewer,
});

/**
 * Direct messages between players and from staff. Storage is @chessmate/db;
 * delivery to open apps and push to closed ones go through the hooks the game
 * server attaches.
 */
export class MessageService {
  private readonly db: Database;
  private readonly now: () => number;
  private notify: (userIds: string[], event: SocialEvent) => void = () => {};
  private notifications: NotificationService | null = null;
  private readonly sent = new Map<string, number[]>();

  constructor(private readonly opts: MessageServiceOptions) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  attach(notify: (userIds: string[], event: SocialEvent) => void, notifications: NotificationService) {
    this.notify = notify;
    this.notifications = notifications;
  }

  private async userOrThrow(id: string): Promise<SocialUser> {
    const u = await getUser(this.db, id);
    if (!u || u.deletedAt) throw new SocialError(404, 'No such player');
    return toSocialUser(u);
  }

  private rateLimit(viewer: string) {
    const now = this.now();
    const recent = (this.sent.get(viewer) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= PER_MINUTE) throw new SocialError(429, 'Slow down: too many messages');
    recent.push(now);
    this.sent.set(viewer, recent);
  }

  /** Whether `from` may message `to` right now, and why not. */
  async canMessage(from: string, to: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (from === to) return { ok: false, reason: 'You cannot message yourself' };
    if (this.opts.isStaff?.(from)) return { ok: true };
    const rows = await pairStatus(this.db, from, to);
    if (rows.some((r) => r.status === 'blocked')) return { ok: false, reason: 'You cannot message this player' };
    const privacy = this.opts.privacyOf?.(to) ?? 'friends';
    if (privacy === 'nobody') return { ok: false, reason: 'This player does not accept messages' };
    if (privacy === 'friends' && !rows.some((r) => r.status === 'accepted')) return { ok: false, reason: 'Only friends can message this player' };
    return { ok: true };
  }

  async send(viewer: string, to: string, input: unknown): Promise<MessageView> {
    const clean = cleanMessage(input);
    if ('error' in clean) throw new SocialError(400, clean.error);
    const [sender, recipient] = await Promise.all([this.userOrThrow(viewer), this.userOrThrow(to)]);
    const allowed = await this.canMessage(viewer, to);
    if (!allowed.ok) throw new SocialError(403, allowed.reason);
    this.rateLimit(viewer);
    const row = await insertMessage(this.db, { senderId: viewer, recipientId: to, body: clean.body, at: new Date(this.now()) });
    await this.deliver(row, sender, recipient.id);
    return toView(row, viewer);
  }

  /** Message from ChessMate staff to one player; shows in their "ChessMate team" thread. */
  async staffSend(staffId: string, to: string, input: unknown, opts: { silent?: boolean } = {}): Promise<MessageView> {
    const clean = cleanMessage(input);
    if ('error' in clean) throw new SocialError(400, clean.error);
    await this.userOrThrow(to);
    const row = await insertMessage(this.db, { senderId: staffId, recipientId: to, body: clean.body, kind: 'staff', at: new Date(this.now()) });
    await this.deliver(row, null, to, opts.silent);
    return toView(row, staffId);
  }

  /** Announcement to every open account. Returns how many players got it. */
  async broadcast(staffId: string, input: unknown): Promise<number> {
    const clean = cleanMessage(input);
    if ('error' in clean) throw new SocialError(400, clean.error);
    const at = new Date(this.now());
    const ids = (await activeUserIds(this.db)).filter((id) => id !== staffId);
    const n = await insertMessages(
      this.db,
      ids.map((recipientId) => ({ senderId: staffId, recipientId, body: clean.body, kind: 'broadcast', at })),
    );
    // Live delivery only (no push to everyone): open apps refresh their inbox.
    const view: MessageView = { id: `broadcast-${at.getTime()}`, from: staffId, to: '*', body: clean.body, kind: 'broadcast', createdAt: at.getTime(), readAt: null, mine: false };
    this.notify(ids, { kind: 'message', message: view, from: null, unread: 1 });
    return n;
  }

  /** `silent`: no inbox/push notification (the caller sends its own, e.g. a moderation notice). */
  private async deliver(row: DirectMessage, sender: SocialUser | null, to: string, silent = false) {
    const unread = await this.unreadTotal(to);
    this.notify([to], { kind: 'message', message: toView(row, to), from: sender, unread });
    // The sender's other devices see it too.
    if (sender) this.notify([sender.id], { kind: 'message', message: toView(row, sender.id), from: sender, unread: await this.unreadTotal(sender.id) });
    if (silent) return;
    this.notifications?.notify(to, {
      kind: sender ? 'message' : 'system',
      title: sender ? sender.displayName : 'Message from ChessMate',
      body: row.body.slice(0, 160),
      url: `/messages/${sender ? sender.id : STAFF_THREAD}`,
      data: { from: sender?.id ?? STAFF_THREAD },
      collapseKey: `dm:${sender?.id ?? STAFF_THREAD}`,
    });
  }

  async unreadTotal(viewer: string): Promise<number> {
    let n = 0;
    for (const v of (await unreadBySender(this.db, viewer)).values()) n += v;
    return n;
  }

  async conversations(viewer: string): Promise<{ conversations: ConversationSummary[]; unread: number }> {
    const [latest, staff, unread] = await Promise.all([latestPerConversation(this.db, viewer, 100), staffMessagesTo(this.db, viewer, 1), unreadBySender(this.db, viewer)]);
    const others = latest.map((m) => (m.senderId === viewer ? m.recipientId : m.senderId));
    const users = await getUsersByIds(this.db, others);
    const out: ConversationSummary[] = [];
    for (const m of latest) {
      const other = m.senderId === viewer ? m.recipientId : m.senderId;
      const u = users.get(other);
      if (!u) continue;
      out.push({ key: other, user: toSocialUser(u), last: toView(m, viewer), unread: unread.get(other) ?? 0 });
    }
    if (staff[0]) out.push({ key: STAFF_THREAD, user: null, last: toView(staff[0], viewer), unread: unread.get(STAFF_THREAD) ?? 0 });
    out.sort((a, b) => b.last.createdAt - a.last.createdAt);
    let total = 0;
    for (const v of unread.values()) total += v;
    return { conversations: out, unread: total };
  }

  /** One conversation, oldest first; marks it read. `key` is a player id or STAFF_THREAD. */
  async thread(viewer: string, key: string, before?: number) {
    if (key === STAFF_THREAD) {
      const rows = await staffMessagesTo(this.db, viewer, PAGE);
      await markRead(this.db, viewer, STAFF_THREAD, new Date(this.now()));
      return { user: null, messages: rows.reverse().map((m) => toView(m, viewer)), canSend: false, reason: 'Replies to the ChessMate team are not possible here' };
    }
    const user = await this.userOrThrow(key);
    const rows = await conversation(this.db, viewer, key, PAGE, before ? new Date(before) : undefined);
    await markRead(this.db, viewer, key, new Date(this.now()));
    const allowed = await this.canMessage(viewer, key);
    return { user, messages: rows.reverse().map((m) => toView(m, viewer)), canSend: allowed.ok, reason: allowed.ok ? null : allowed.reason };
  }

  async markRead(viewer: string, key: string) {
    await markRead(this.db, viewer, key, new Date(this.now()));
    return { unread: await this.unreadTotal(viewer) };
  }
}
