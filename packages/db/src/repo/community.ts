import { and, asc, desc, eq, getTableColumns, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { forumReplies, forumTopics, newsComments, newsLikes, newsPosts, users, type ForumReply, type ForumTopic, type NewsComment, type NewsPost } from '../schema';

/**
 * News (staff posts with likes and comments) and the forum (player topics
 * with replies). Rows are soft-deleted so moderation can be audited; every
 * read hides deleted rows. Author names come from the users table at read
 * time, so a rename shows everywhere.
 */

export interface Author {
  id: string;
  username: string;
  displayName: string;
}

const author = {
  username: users.username,
  displayName: users.displayName,
};
const toAuthor = (id: string, r: { username: string | null; displayName: string | null }): Author => ({
  id,
  username: r.username ?? 'deleted',
  displayName: r.displayName ?? r.username ?? 'Deleted account',
});

// ---------------------------------------------------------------- news

export type NewsRow = Omit<NewsPost, 'image'> & { hasImage: boolean; author: Author };

/** News columns without the picture itself (lists and pages load it from its own URL). */
const { image: imageColumn, ...newsColumns } = getTableColumns(newsPosts);
void imageColumn;
const newsSelect = { ...newsColumns, hasImage: sql<boolean>`${newsPosts.image} is not null` };

export async function getNewsImage(db: Database, id: string): Promise<{ image: string | null; at: Date } | undefined> {
  const [row] = await db.select({ image: newsPosts.image, at: sql<Date>`coalesce(${newsPosts.updatedAt}, ${newsPosts.createdAt})` }).from(newsPosts).where(and(eq(newsPosts.id, id), isNull(newsPosts.deletedAt)));
  return row;
}

export async function listNews(db: Database, opts: { limit?: number; before?: Date } = {}): Promise<NewsRow[]> {
  const conds = [isNull(newsPosts.deletedAt)];
  if (opts.before) conds.push(lt(newsPosts.createdAt, opts.before));
  const rows = await db
    .select({ post: newsSelect, ...author })
    .from(newsPosts)
    .leftJoin(users, eq(users.id, newsPosts.authorId))
    .where(and(...conds))
    .orderBy(...(opts.before ? [] : [desc(newsPosts.pinned)]), desc(newsPosts.createdAt))
    .limit(Math.min(opts.limit ?? 20, 50));
  return rows.map((r) => ({ ...r.post, author: toAuthor(r.post.authorId, r) }));
}

export async function getNews(db: Database, id: string): Promise<NewsRow | undefined> {
  const [r] = await db
    .select({ post: newsSelect, ...author })
    .from(newsPosts)
    .leftJoin(users, eq(users.id, newsPosts.authorId))
    .where(and(eq(newsPosts.id, id), isNull(newsPosts.deletedAt)));
  return r && { ...r.post, author: toAuthor(r.post.authorId, r) };
}

export async function insertNews(
  db: Database,
  p: { authorId: string; title: string; body: string; pinned?: boolean; image?: string | null; links?: { label: string; url: string }[] },
): Promise<NewsPost> {
  const [row] = await db
    .insert(newsPosts)
    .values({ authorId: p.authorId, title: p.title, body: p.body, pinned: !!p.pinned, image: p.image ?? null, links: p.links ?? [] })
    .returning();
  return row!;
}

export async function updateNews(
  db: Database,
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean; image?: string | null; links?: { label: string; url: string }[] },
): Promise<void> {
  await db
    .update(newsPosts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(newsPosts.id, id), isNull(newsPosts.deletedAt)));
}

export async function deleteNews(db: Database, id: string): Promise<void> {
  await db.update(newsPosts).set({ deletedAt: new Date() }).where(eq(newsPosts.id, id));
}

/** Which of these posts the user liked. */
export async function likedNews(db: Database, userId: string, postIds: string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  const rows = await db
    .select({ postId: newsLikes.postId })
    .from(newsLikes)
    .where(and(eq(newsLikes.userId, userId), inArray(newsLikes.postId, postIds)));
  return new Set(rows.map((r) => r.postId));
}

/** Likes or unlikes; returns the new state and count. */
export async function toggleNewsLike(db: Database, postId: string, userId: string, like: boolean): Promise<{ liked: boolean; likeCount: number }> {
  if (like) {
    const added = await db.insert(newsLikes).values({ postId, userId }).onConflictDoNothing().returning();
    if (added.length) await db.update(newsPosts).set({ likeCount: sql`${newsPosts.likeCount} + 1` }).where(eq(newsPosts.id, postId));
  } else {
    const removed = await db
      .delete(newsLikes)
      .where(and(eq(newsLikes.postId, postId), eq(newsLikes.userId, userId)))
      .returning();
    if (removed.length) await db.update(newsPosts).set({ likeCount: sql`greatest(${newsPosts.likeCount} - 1, 0)` }).where(eq(newsPosts.id, postId));
  }
  const [p] = await db.select({ likeCount: newsPosts.likeCount }).from(newsPosts).where(eq(newsPosts.id, postId));
  return { liked: like, likeCount: p?.likeCount ?? 0 };
}

export type NewsCommentRow = NewsComment & { author: Author };

export async function listNewsComments(db: Database, postId: string, limit = 200): Promise<NewsCommentRow[]> {
  const rows = await db
    .select({ c: newsComments, ...author })
    .from(newsComments)
    .leftJoin(users, eq(users.id, newsComments.userId))
    .where(and(eq(newsComments.postId, postId), isNull(newsComments.deletedAt)))
    .orderBy(asc(newsComments.createdAt))
    .limit(Math.min(limit, 500));
  return rows.map((r) => ({ ...r.c, author: toAuthor(r.c.userId, r) }));
}

export async function insertNewsComment(db: Database, c: { postId: string; userId: string; body: string }): Promise<NewsComment> {
  const [row] = await db.insert(newsComments).values(c).returning();
  await db.update(newsPosts).set({ commentCount: sql`${newsPosts.commentCount} + 1` }).where(eq(newsPosts.id, c.postId));
  return row!;
}

export async function getNewsComment(db: Database, id: string): Promise<NewsComment | undefined> {
  const [row] = await db.select().from(newsComments).where(and(eq(newsComments.id, id), isNull(newsComments.deletedAt)));
  return row;
}

export async function deleteNewsComment(db: Database, id: string): Promise<void> {
  const [row] = await db
    .update(newsComments)
    .set({ deletedAt: new Date() })
    .where(and(eq(newsComments.id, id), isNull(newsComments.deletedAt)))
    .returning();
  if (row) await db.update(newsPosts).set({ commentCount: sql`greatest(${newsPosts.commentCount} - 1, 0)` }).where(eq(newsPosts.id, row.postId));
}

// ---------------------------------------------------------------- forum

export type TopicRow = ForumTopic & { author: Author };

/** Pinned first, then most recent activity. Page with `before` (the last row's lastActivityAt). */
export async function listTopics(db: Database, opts: { category?: string; limit?: number; before?: Date } = {}): Promise<TopicRow[]> {
  const conds = [isNull(forumTopics.deletedAt)];
  if (opts.category) conds.push(eq(forumTopics.category, opts.category));
  if (opts.before) conds.push(lt(forumTopics.lastActivityAt, opts.before));
  const rows = await db
    .select({ t: forumTopics, ...author })
    .from(forumTopics)
    .leftJoin(users, eq(users.id, forumTopics.userId))
    .where(and(...conds))
    .orderBy(...(opts.before ? [] : [desc(forumTopics.pinned)]), desc(forumTopics.lastActivityAt))
    .limit(Math.min(opts.limit ?? 30, 50));
  return rows.map((r) => ({ ...r.t, author: toAuthor(r.t.userId, r) }));
}

export async function getTopic(db: Database, id: string): Promise<TopicRow | undefined> {
  const [r] = await db
    .select({ t: forumTopics, ...author })
    .from(forumTopics)
    .leftJoin(users, eq(users.id, forumTopics.userId))
    .where(and(eq(forumTopics.id, id), isNull(forumTopics.deletedAt)));
  return r && { ...r.t, author: toAuthor(r.t.userId, r) };
}

export async function insertTopic(db: Database, t: { userId: string; category: string; title: string; body: string; at?: Date }): Promise<ForumTopic> {
  const { at, ...rest } = t;
  const [row] = await db
    .insert(forumTopics)
    .values({ ...rest, ...(at ? { createdAt: at, lastActivityAt: at } : {}) })
    .returning();
  return row!;
}

export async function updateTopic(db: Database, id: string, patch: { pinned?: boolean; locked?: boolean; title?: string; body?: string }): Promise<void> {
  await db
    .update(forumTopics)
    .set(patch)
    .where(and(eq(forumTopics.id, id), isNull(forumTopics.deletedAt)));
}

export async function deleteTopic(db: Database, id: string): Promise<void> {
  await db.update(forumTopics).set({ deletedAt: new Date() }).where(eq(forumTopics.id, id));
}

/** Topics a user started recently, for flood control. */
export async function countRecentTopics(db: Database, userId: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(forumTopics)
    .where(and(eq(forumTopics.userId, userId), sql`${forumTopics.createdAt} > ${since}`));
  return r?.n ?? 0;
}

export type ReplyRow = ForumReply & { author: Author };

export async function listReplies(db: Database, topicId: string, opts: { limit?: number; offset?: number } = {}): Promise<ReplyRow[]> {
  const rows = await db
    .select({ r: forumReplies, ...author })
    .from(forumReplies)
    .leftJoin(users, eq(users.id, forumReplies.userId))
    .where(and(eq(forumReplies.topicId, topicId), isNull(forumReplies.deletedAt)))
    .orderBy(asc(forumReplies.createdAt))
    .limit(Math.min(opts.limit ?? 100, 200))
    .offset(Math.max(0, opts.offset ?? 0));
  return rows.map((x) => ({ ...x.r, author: toAuthor(x.r.userId, x) }));
}

export async function insertReply(db: Database, r: { topicId: string; userId: string; body: string }): Promise<ForumReply> {
  const [row] = await db.insert(forumReplies).values(r).returning();
  await db
    .update(forumTopics)
    .set({ replyCount: sql`${forumTopics.replyCount} + 1`, lastActivityAt: new Date() })
    .where(eq(forumTopics.id, r.topicId));
  return row!;
}

export async function getReply(db: Database, id: string): Promise<ForumReply | undefined> {
  const [row] = await db.select().from(forumReplies).where(and(eq(forumReplies.id, id), isNull(forumReplies.deletedAt)));
  return row;
}

export async function deleteReply(db: Database, id: string): Promise<void> {
  const [row] = await db
    .update(forumReplies)
    .set({ deletedAt: new Date() })
    .where(and(eq(forumReplies.id, id), isNull(forumReplies.deletedAt)))
    .returning();
  if (row) await db.update(forumTopics).set({ replyCount: sql`greatest(${forumTopics.replyCount} - 1, 0)` }).where(eq(forumTopics.id, row.topicId));
}
