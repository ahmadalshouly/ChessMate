import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { directMessages, users, type DirectMessage } from '../schema';

/**
 * Direct messages. A conversation is every row between two ids, either
 * direction. Staff messages are rows whose sender is a staff account and
 * `kind` is 'staff' or 'broadcast'.
 */

export async function insertMessage(db: Database, m: { senderId: string; recipientId: string; body: string; kind?: string; at?: Date }): Promise<DirectMessage> {
  const [row] = await db
    .insert(directMessages)
    .values({ senderId: m.senderId, recipientId: m.recipientId, body: m.body, kind: m.kind ?? 'user', createdAt: m.at ?? new Date() })
    .returning();
  return row!;
}

/** One message per recipient, for announcements. */
export async function insertMessages(db: Database, rows: { senderId: string; recipientId: string; body: string; kind: string; at: Date }[]): Promise<number> {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(directMessages).values(rows.slice(i, i + 500).map((r) => ({ senderId: r.senderId, recipientId: r.recipientId, body: r.body, kind: r.kind, createdAt: r.at })));
  }
  return rows.length;
}

/** Messages between two ids, newest first, before an optional time. */
export async function conversation(db: Database, a: string, b: string, limit: number, before?: Date): Promise<DirectMessage[]> {
  const pair = or(and(eq(directMessages.senderId, a), eq(directMessages.recipientId, b)), and(eq(directMessages.senderId, b), eq(directMessages.recipientId, a)));
  return db
    .select()
    .from(directMessages)
    .where(before ? and(pair, lt(directMessages.createdAt, before)) : pair)
    .orderBy(desc(directMessages.createdAt))
    .limit(limit);
}

/** Staff and broadcast messages to one player, newest first (all staff senders share one thread). */
export async function staffMessagesTo(db: Database, userId: string, limit: number): Promise<DirectMessage[]> {
  return db
    .select()
    .from(directMessages)
    .where(and(eq(directMessages.recipientId, userId), inArray(directMessages.kind, ['staff', 'broadcast'])))
    .orderBy(desc(directMessages.createdAt))
    .limit(limit);
}

/** The latest message of each conversation the player is in (player-to-player only), newest first. */
export async function latestPerConversation(db: Database, userId: string, limit: number): Promise<DirectMessage[]> {
  const rows = await db
    .select()
    .from(directMessages)
    .where(and(eq(directMessages.kind, 'user'), or(eq(directMessages.senderId, userId), eq(directMessages.recipientId, userId))))
    .orderBy(desc(directMessages.createdAt))
    .limit(2000);
  const seen = new Set<string>();
  const out: DirectMessage[] = [];
  for (const r of rows) {
    const other = r.senderId === userId ? r.recipientId : r.senderId;
    if (seen.has(other)) continue;
    seen.add(other);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Unread counts by sender for one recipient; staff messages are counted under the key 'staff'. */
export async function unreadBySender(db: Database, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ senderId: directMessages.senderId, kind: directMessages.kind, n: sql<number>`count(*)::int` })
    .from(directMessages)
    .where(and(eq(directMessages.recipientId, userId), isNull(directMessages.readAt)))
    .groupBy(directMessages.senderId, directMessages.kind);
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = r.kind === 'user' ? r.senderId : 'staff';
    out.set(key, (out.get(key) ?? 0) + Number(r.n));
  }
  return out;
}

/** Marks a conversation read for the recipient (`from` = the other player, or 'staff'). */
export async function markRead(db: Database, userId: string, from: string, at = new Date()): Promise<void> {
  const who = from === 'staff' ? inArray(directMessages.kind, ['staff', 'broadcast']) : and(eq(directMessages.kind, 'user'), eq(directMessages.senderId, from));
  await db
    .update(directMessages)
    .set({ readAt: at })
    .where(and(eq(directMessages.recipientId, userId), isNull(directMessages.readAt), who));
}

/** Ids of every open account, for announcements. */
export async function activeUserIds(db: Database): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(and(isNull(users.deletedAt), isNull(users.closedAt)));
  return rows.map((r) => r.id);
}
