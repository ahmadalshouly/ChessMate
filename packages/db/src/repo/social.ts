import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { activity, follows, friendships, users, type ActivityRow, type User } from '../schema';

/**
 * Social graph queries.
 *
 * `friendships` holds one row per ordered pair:
 *   (requester -> addressee, pending)   a friend request
 *   (either direction, accepted)        a friendship
 *   (blocker -> blocked, blocked)       a block
 * The service keeps at most one row per pair, except that two users may block
 * each other.
 */

export interface Since {
  id: string;
  since: Date;
}

const pairRows = (a: string, b: string) =>
  or(
    and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
    and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
  );

// ---- users ----

/** Active accounts whose username or display name starts with `prefix` (case-insensitive). */
export async function searchUsers(db: Database, prefix: string, limit: number): Promise<User[]> {
  const like = `${prefix.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select()
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        or(sql`lower(${users.username}) like ${like}`, sql`lower(coalesce(${users.displayName}, '')) like ${like}`),
      ),
    )
    .orderBy(asc(sql`lower(${users.username})`))
    .limit(limit);
}

export async function getUsersByIds(db: Database, ids: string[]): Promise<Map<string, User>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(users)
    .where(and(inArray(users.id, [...new Set(ids)]), isNull(users.deletedAt)));
  return new Map(rows.map((u) => [u.id, u]));
}

// ---- friendships and requests ----

/** Every friendships row between two users, either direction. */
export async function pairStatus(db: Database, a: string, b: string) {
  return db.select().from(friendships).where(pairRows(a, b));
}

export async function friendsOf(db: Database, userId: string): Promise<Since[]> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))),
    );
  return rows.map((r) => ({
    id: r.requesterId === userId ? r.addresseeId : r.requesterId,
    since: r.respondedAt ?? r.createdAt,
  }));
}

export async function friendCount(db: Database, userId: string): Promise<number> {
  return (await friendsOf(db, userId)).length;
}

export async function incomingRequests(db: Database, userId: string): Promise<Since[]> {
  const rows = await db
    .select({ id: friendships.requesterId, since: friendships.createdAt })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')))
    .orderBy(desc(friendships.createdAt));
  return rows;
}

export async function outgoingRequests(db: Database, userId: string): Promise<Since[]> {
  return db
    .select({ id: friendships.addresseeId, since: friendships.createdAt })
    .from(friendships)
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')))
    .orderBy(desc(friendships.createdAt));
}

export async function insertFriendRequest(db: Database, from: string, to: string): Promise<void> {
  await db.insert(friendships).values({ requesterId: from, addresseeId: to, status: 'pending' }).onConflictDoNothing();
}

/** Turns a pending request into a friendship. Returns false if there was none. */
export async function acceptFriendRequest(db: Database, from: string, to: string): Promise<boolean> {
  const rows = await db
    .update(friendships)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(and(eq(friendships.requesterId, from), eq(friendships.addresseeId, to), eq(friendships.status, 'pending')))
    .returning();
  return rows.length > 0;
}

export async function deleteFriendRequest(db: Database, from: string, to: string): Promise<boolean> {
  const rows = await db
    .delete(friendships)
    .where(and(eq(friendships.requesterId, from), eq(friendships.addresseeId, to), eq(friendships.status, 'pending')))
    .returning();
  return rows.length > 0;
}

export async function deleteFriendship(db: Database, a: string, b: string): Promise<boolean> {
  const rows = await db
    .delete(friendships)
    .where(and(pairRows(a, b), eq(friendships.status, 'accepted')))
    .returning();
  return rows.length > 0;
}

// ---- follows ----

export async function insertFollow(db: Database, follower: string, followee: string): Promise<boolean> {
  const rows = await db.insert(follows).values({ followerId: follower, followeeId: followee }).onConflictDoNothing().returning();
  return rows.length > 0;
}

export async function deleteFollow(db: Database, follower: string, followee: string): Promise<boolean> {
  const rows = await db
    .delete(follows)
    .where(and(eq(follows.followerId, follower), eq(follows.followeeId, followee)))
    .returning();
  return rows.length > 0;
}

export async function isFollowing(db: Database, follower: string, followee: string): Promise<boolean> {
  const [r] = await db
    .select({ x: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, follower), eq(follows.followeeId, followee)));
  return !!r;
}

export async function followingOf(db: Database, userId: string): Promise<Since[]> {
  return db
    .select({ id: follows.followeeId, since: follows.createdAt })
    .from(follows)
    .where(eq(follows.followerId, userId))
    .orderBy(desc(follows.createdAt));
}

export async function followersOf(db: Database, userId: string): Promise<Since[]> {
  return db
    .select({ id: follows.followerId, since: follows.createdAt })
    .from(follows)
    .where(eq(follows.followeeId, userId))
    .orderBy(desc(follows.createdAt));
}

// ---- blocks ----

/** Removes every tie between the two users and records the block. */
export async function blockUser(db: Database, blocker: string, blocked: string): Promise<{ wasFriend: boolean }> {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(friendships).where(pairRows(blocker, blocked));
    const wasFriend = existing.some((r) => r.status === 'accepted');
    await tx
      .delete(friendships)
      .where(and(pairRows(blocker, blocked), or(eq(friendships.status, 'pending'), eq(friendships.status, 'accepted'))));
    await tx
      .delete(follows)
      .where(
        or(
          and(eq(follows.followerId, blocker), eq(follows.followeeId, blocked)),
          and(eq(follows.followerId, blocked), eq(follows.followeeId, blocker)),
        ),
      );
    await tx
      .insert(friendships)
      .values({ requesterId: blocker, addresseeId: blocked, status: 'blocked', respondedAt: new Date() })
      .onConflictDoUpdate({
        target: [friendships.requesterId, friendships.addresseeId],
        set: { status: 'blocked', respondedAt: new Date() },
      });
    return { wasFriend };
  });
}

export async function unblockUser(db: Database, blocker: string, blocked: string): Promise<boolean> {
  const rows = await db
    .delete(friendships)
    .where(and(eq(friendships.requesterId, blocker), eq(friendships.addresseeId, blocked), eq(friendships.status, 'blocked')))
    .returning();
  return rows.length > 0;
}

export async function blockedBy(db: Database, userId: string): Promise<Since[]> {
  return db
    .select({ id: friendships.addresseeId, since: sql<Date>`coalesce(${friendships.respondedAt}, ${friendships.createdAt})` })
    .from(friendships)
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'blocked')))
    .orderBy(desc(friendships.respondedAt));
}

/** Everyone this user blocked or was blocked by. */
export async function blockSet(db: Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(eq(friendships.status, 'blocked'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))),
    );
  return new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)));
}

// ---- activity feed ----

export async function addActivity(
  db: Database,
  kind: string,
  actorId: string,
  subjectId: string | null,
  data: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(activity).values({ kind, actorId, subjectId, data });
}

/**
 * Events involving the user, their friends, or people they follow, newest
 * first, older than `before`. Events touching anyone in a block with the
 * viewer are dropped.
 */
export async function feedFor(db: Database, userId: string, limit: number, before?: Date): Promise<ActivityRow[]> {
  const network = sql`(
    select ${userId}::text
    union select case when requester_id = ${userId} then addressee_id else requester_id end
      from friendships where status = 'accepted' and (requester_id = ${userId} or addressee_id = ${userId})
    union select followee_id from follows where follower_id = ${userId}
  )`;
  const hidden = sql`(
    select case when requester_id = ${userId} then addressee_id else requester_id end
      from friendships where status = 'blocked' and (requester_id = ${userId} or addressee_id = ${userId})
  )`;
  return db
    .select()
    .from(activity)
    .where(
      and(
        before ? sql`${activity.createdAt} < ${before.toISOString()}` : undefined,
        sql`(${activity.actorId} in ${network} or ${activity.subjectId} in ${network})`,
        sql`${activity.actorId} not in ${hidden}`,
        sql`(${activity.subjectId} is null or ${activity.subjectId} not in ${hidden})`,
      ),
    )
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(limit);
}
