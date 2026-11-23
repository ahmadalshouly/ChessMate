import { and, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { notificationPrefs, notifications, pushTokens, type NotificationPrefsRow, type PushTokenDbRow } from '../schema';

/**
 * Notifications, notification preferences and push tokens. The game server
 * keeps a cache in memory and writes through to these tables, so the inbox
 * and push delivery survive restarts.
 */

export type NotificationDbRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;

/** Recent notifications (newest first per user, at most `perUser` each), all preferences and all push tokens. */
export async function loadNotificationState(
  db: Database,
  opts: { since: Date; perUser: number },
): Promise<{ notifications: NotificationDbRow[]; prefs: NotificationPrefsRow[]; tokens: PushTokenDbRow[] }> {
  const ranked = db
    .select({ id: notifications.id, rank: sql<number>`row_number() over (partition by ${notifications.userId} order by ${notifications.createdAt} desc)`.as('rank') })
    .from(notifications)
    .where(gte(notifications.createdAt, opts.since))
    .as('ranked');
  const recent = await db
    .select({ n: notifications })
    .from(notifications)
    .innerJoin(ranked, eq(ranked.id, notifications.id))
    .where(sql`${ranked.rank} <= ${opts.perUser}`)
    .orderBy(desc(notifications.createdAt));
  return {
    notifications: recent.map((r) => r.n),
    prefs: await db.select().from(notificationPrefs),
    tokens: await db.select().from(pushTokens),
  };
}

/** Stores a notification, replacing unread ones with the same collapse key, and keeps the user's newest `keep`. */
export async function insertNotification(db: Database, row: NewNotificationRow & { id: string; userId: string }, keep: number): Promise<void> {
  if (row.collapseKey) {
    await db.delete(notifications).where(and(eq(notifications.userId, row.userId), eq(notifications.collapseKey, row.collapseKey), isNull(notifications.readAt)));
  }
  await db.insert(notifications).values(row).onConflictDoNothing();
  const newest = db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, row.userId)).orderBy(desc(notifications.createdAt)).limit(keep);
  await db.delete(notifications).where(and(eq(notifications.userId, row.userId), notInArray(notifications.id, newest)));
}

export async function markNotificationsRead(db: Database, userId: string, ids: string[] | 'all', at: Date): Promise<void> {
  if (ids !== 'all' && ids.length === 0) return;
  const which = ids === 'all' ? undefined : inArray(notifications.id, ids);
  await db
    .update(notifications)
    .set({ readAt: at })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), which));
}

export async function deleteNotification(db: Database, userId: string, id: string): Promise<void> {
  await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
}

/** Removes notifications older than `before` (retention). Returns how many were removed. */
export async function pruneNotifications(db: Database, before: Date): Promise<number> {
  const gone = await db.delete(notifications).where(lt(notifications.createdAt, before)).returning({ id: notifications.id });
  return gone.length;
}

export async function upsertNotificationPrefs(db: Database, userId: string, prefs: unknown): Promise<void> {
  const now = new Date();
  await db
    .insert(notificationPrefs)
    .values({ userId, prefs, updatedAt: now })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: { prefs, updatedAt: now } });
}

export async function upsertPushToken(db: Database, row: PushTokenDbRow): Promise<void> {
  const { token, ...rest } = row;
  await db.insert(pushTokens).values(row).onConflictDoUpdate({ target: pushTokens.token, set: rest });
}

export async function deletePushToken(db: Database, token: string, userId?: string): Promise<void> {
  await db.delete(pushTokens).where(userId ? and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)) : eq(pushTokens.token, token));
}
