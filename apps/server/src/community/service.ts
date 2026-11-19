import {
  COMMUNITY_LIMITS,
  cleanBody,
  cleanTitle,
  isForumCategory,
  type CommentView,
  type CommunityAuthor,
  type NewsPostView,
  type ReplyView,
  type TopicView,
} from '@chessmate/core';
import {
  countRecentTopics,
  deleteNews,
  deleteNewsComment,
  deleteReply,
  deleteTopic,
  getNews,
  getNewsComment,
  getReply,
  getTopic,
  insertNews,
  insertNewsComment,
  insertReply,
  insertTopic,
  likedNews,
  listNews,
  listNewsComments,
  listReplies,
  listTopics,
  toggleNewsLike,
  updateNews,
  updateTopic,
  type Author,
  type Database,
} from '@chessmate/db';

export class CommunityError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CommunityOptions {
  db: Database;
  /** Moderators and admins: write news, moderate the forum and comments. */
  isStaff: (userId: string) => boolean;
  /** Why this player can't post right now (closed account, chat mute), or null. */
  blockedReason?: (userId: string) => string | null;
  /** A reply to their topic or comment on staff news: tell the author. */
  notify?: (userId: string, title: string, body: string, url: string) => void;
  now?: () => number;
}

/**
 * News and forum. Reading is open to everyone; posting needs an account and
 * an unrestricted one. Staff write news, and can pin, lock and remove forum
 * topics and any comment or reply.
 */
export class CommunityService {
  private readonly db: Database;
  private readonly now: () => number;
  /** Last comment or reply per player, for a short gap between posts. */
  private lastPost = new Map<string, number>();

  constructor(private readonly opts: CommunityOptions) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  /** The game server supplies restrictions (closed accounts, chat mutes) and notifications. */
  attach(hooks: Pick<CommunityOptions, 'blockedReason' | 'notify'>) {
    Object.assign(this.opts, hooks);
  }

  private author(a: Author): CommunityAuthor {
    return { ...a, staff: this.opts.isStaff(a.id) };
  }

  private requireStaff(viewer: string | null): string {
    if (!viewer) throw new CommunityError(401, 'Sign in again');
    if (!this.opts.isStaff(viewer)) throw new CommunityError(403, 'Only the ChessMate team can do that');
    return viewer;
  }

  private requirePoster(viewer: string | null): string {
    if (!viewer) throw new CommunityError(401, 'Sign in to join the conversation');
    const reason = this.opts.blockedReason?.(viewer);
    if (reason) throw new CommunityError(403, reason);
    return viewer;
  }

  private throttle(viewer: string) {
    if (this.opts.isStaff(viewer)) return;
    const last = this.lastPost.get(viewer) ?? 0;
    if (this.now() - last < COMMUNITY_LIMITS.commentGapS * 1000) throw new CommunityError(429, 'You are posting too fast. Wait a few seconds.');
    this.lastPost.set(viewer, this.now());
    if (this.lastPost.size > 50_000) this.lastPost.clear();
  }

  private ok<T>(r: { value: T } | { error: string }): T {
    if ('error' in r) throw new CommunityError(400, r.error);
    return r.value;
  }

  // ---------------------------------------------------------------- news

  async news(viewer: string | null, before?: number): Promise<NewsPostView[]> {
    const rows = await listNews(this.db, { limit: 20, before: before ? new Date(before) : undefined });
    const liked = viewer ? await likedNews(this.db, viewer, rows.map((r) => r.id)) : new Set<string>();
    return rows.map((r) => this.postView(r, liked.has(r.id)));
  }

  private postView(r: Awaited<ReturnType<typeof listNews>>[number], liked: boolean): NewsPostView {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      author: this.author(r.author),
      pinned: r.pinned,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      liked,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt?.getTime() ?? null,
    };
  }

  async newsPost(viewer: string | null, id: string): Promise<{ post: NewsPostView; comments: CommentView[] }> {
    const r = await getNews(this.db, id);
    if (!r) throw new CommunityError(404, 'This post is no longer available');
    const liked = viewer ? (await likedNews(this.db, viewer, [id])).has(id) : false;
    const staff = !!viewer && this.opts.isStaff(viewer);
    const comments = (await listNewsComments(this.db, id)).map(
      (c): CommentView => ({ id: c.id, body: c.body, author: this.author(c.author), createdAt: c.createdAt.getTime(), canDelete: staff || c.userId === viewer }),
    );
    return { post: this.postView(r, liked), comments };
  }

  async writeNews(viewer: string | null, input: Record<string, unknown>): Promise<NewsPostView> {
    const me = this.requireStaff(viewer);
    const title = this.ok(cleanTitle(input.title));
    const body = this.ok(cleanBody(input.body, COMMUNITY_LIMITS.postBodyMax));
    const row = await insertNews(this.db, { authorId: me, title, body, pinned: input.pinned === true });
    return (await this.newsPost(me, row.id)).post;
  }

  async editNews(viewer: string | null, id: string, input: Record<string, unknown>): Promise<NewsPostView> {
    this.requireStaff(viewer);
    if (!(await getNews(this.db, id))) throw new CommunityError(404, 'This post is no longer available');
    const patch: { title?: string; body?: string; pinned?: boolean } = {};
    if (input.title !== undefined) patch.title = this.ok(cleanTitle(input.title));
    if (input.body !== undefined) patch.body = this.ok(cleanBody(input.body, COMMUNITY_LIMITS.postBodyMax));
    if (typeof input.pinned === 'boolean') patch.pinned = input.pinned;
    await updateNews(this.db, id, patch);
    return (await this.newsPost(viewer, id)).post;
  }

  async removeNews(viewer: string | null, id: string) {
    this.requireStaff(viewer);
    await deleteNews(this.db, id);
    return { ok: true };
  }

  async like(viewer: string | null, id: string, like: boolean) {
    if (!viewer) throw new CommunityError(401, 'Sign in to like posts');
    if (!(await getNews(this.db, id))) throw new CommunityError(404, 'This post is no longer available');
    return toggleNewsLike(this.db, id, viewer, like);
  }

  async comment(viewer: string | null, postId: string, input: Record<string, unknown>): Promise<CommentView> {
    const me = this.requirePoster(viewer);
    const body = this.ok(cleanBody(input.body, COMMUNITY_LIMITS.commentMax));
    if (!(await getNews(this.db, postId))) throw new CommunityError(404, 'This post is no longer available');
    this.throttle(me);
    const c = await insertNewsComment(this.db, { postId, userId: me, body });
    const all = await listNewsComments(this.db, postId);
    const row = all.find((x) => x.id === c.id)!;
    return { id: row.id, body: row.body, author: this.author(row.author), createdAt: row.createdAt.getTime(), canDelete: true };
  }

  async removeComment(viewer: string | null, id: string) {
    if (!viewer) throw new CommunityError(401, 'Sign in again');
    const c = await getNewsComment(this.db, id);
    if (!c) throw new CommunityError(404, 'This comment is already gone');
    if (c.userId !== viewer && !this.opts.isStaff(viewer)) throw new CommunityError(403, 'You can only delete your own comments');
    await deleteNewsComment(this.db, id);
    return { ok: true };
  }

  // ---------------------------------------------------------------- forum

  private topicView(t: Awaited<ReturnType<typeof listTopics>>[number], viewer: string | null, full: boolean): TopicView {
    const staff = !!viewer && this.opts.isStaff(viewer);
    return {
      id: t.id,
      category: isForumCategory(t.category) ? t.category : 'general',
      title: t.title,
      body: full ? t.body : t.body.slice(0, 220),
      author: this.author(t.author),
      pinned: t.pinned,
      locked: t.locked,
      replyCount: t.replyCount,
      lastActivityAt: t.lastActivityAt.getTime(),
      createdAt: t.createdAt.getTime(),
      canDelete: staff || t.userId === viewer,
    };
  }

  async topics(viewer: string | null, opts: { category?: string; before?: number } = {}): Promise<TopicView[]> {
    const rows = await listTopics(this.db, {
      category: isForumCategory(opts.category) ? opts.category : undefined,
      before: opts.before ? new Date(opts.before) : undefined,
      limit: 30,
    });
    return rows.map((t) => this.topicView(t, viewer, false));
  }

  async topic(viewer: string | null, id: string, offset = 0): Promise<{ topic: TopicView; replies: ReplyView[] }> {
    const t = await getTopic(this.db, id);
    if (!t) throw new CommunityError(404, 'This topic is no longer available');
    const staff = !!viewer && this.opts.isStaff(viewer);
    const replies = (await listReplies(this.db, id, { offset, limit: 200 })).map(
      (r): ReplyView => ({ id: r.id, body: r.body, author: this.author(r.author), createdAt: r.createdAt.getTime(), canDelete: staff || r.userId === viewer }),
    );
    return { topic: this.topicView(t, viewer, true), replies };
  }

  async startTopic(viewer: string | null, input: Record<string, unknown>): Promise<TopicView> {
    const me = this.requirePoster(viewer);
    const title = this.ok(cleanTitle(input.title));
    const body = this.ok(cleanBody(input.body, COMMUNITY_LIMITS.topicBodyMax));
    const category = isForumCategory(input.category) ? input.category : 'general';
    if (!this.opts.isStaff(me) && (await countRecentTopics(this.db, me, new Date(this.now() - 3600_000))) >= COMMUNITY_LIMITS.topicsPerHour) {
      throw new CommunityError(429, 'You started several topics in the last hour. Try again later.');
    }
    const row = await insertTopic(this.db, { userId: me, category, title, body });
    return (await this.topic(me, row.id)).topic;
  }

  async reply(viewer: string | null, topicId: string, input: Record<string, unknown>): Promise<ReplyView> {
    const me = this.requirePoster(viewer);
    const body = this.ok(cleanBody(input.body, COMMUNITY_LIMITS.commentMax * 3));
    const t = await getTopic(this.db, topicId);
    if (!t) throw new CommunityError(404, 'This topic is no longer available');
    if (t.locked && !this.opts.isStaff(me)) throw new CommunityError(403, 'This topic is locked');
    this.throttle(me);
    const r = await insertReply(this.db, { topicId, userId: me, body });
    if (t.userId !== me) this.opts.notify?.(t.userId, 'New reply to your topic', t.title, `/forum/${topicId}`);
    const all = await listReplies(this.db, topicId, { offset: Math.max(0, t.replyCount - 5), limit: 50 });
    const row = all.find((x) => x.id === r.id);
    return {
      id: r.id,
      body: r.body,
      author: row ? this.author(row.author) : { id: me, username: '', displayName: '', staff: this.opts.isStaff(me) },
      createdAt: r.createdAt.getTime(),
      canDelete: true,
    };
  }

  async removeTopic(viewer: string | null, id: string) {
    if (!viewer) throw new CommunityError(401, 'Sign in again');
    const t = await getTopic(this.db, id);
    if (!t) throw new CommunityError(404, 'This topic is already gone');
    if (t.userId !== viewer && !this.opts.isStaff(viewer)) throw new CommunityError(403, 'You can only delete your own topics');
    await deleteTopic(this.db, id);
    return { ok: true };
  }

  async removeReply(viewer: string | null, id: string) {
    if (!viewer) throw new CommunityError(401, 'Sign in again');
    const r = await getReply(this.db, id);
    if (!r) throw new CommunityError(404, 'This reply is already gone');
    if (r.userId !== viewer && !this.opts.isStaff(viewer)) throw new CommunityError(403, 'You can only delete your own replies');
    await deleteReply(this.db, id);
    return { ok: true };
  }

  async moderate(viewer: string | null, id: string, input: Record<string, unknown>): Promise<TopicView> {
    this.requireStaff(viewer);
    if (!(await getTopic(this.db, id))) throw new CommunityError(404, 'This topic is no longer available');
    const patch: { pinned?: boolean; locked?: boolean } = {};
    if (typeof input.pinned === 'boolean') patch.pinned = input.pinned;
    if (typeof input.locked === 'boolean') patch.locked = input.locked;
    await updateTopic(this.db, id, patch);
    return (await this.topic(viewer, id)).topic;
  }
}
