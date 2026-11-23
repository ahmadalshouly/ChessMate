import {
  DEFAULT_SETTINGS,
  SOCIAL_LIMITS,
  audienceAllows,
  type FeedItem,
  type FriendEntry,
  type FriendRequestEntry,
  type LiveGameEntry,
  type Presence,
  type Relationship,
  type SocialEvent,
  type SocialUser,
  type UserSettings,
  type UserWithRelationship,
} from '@chessmate/core';
import {
  acceptFriendRequest,
  addActivity,
  blockSet,
  blockUser,
  blockedBy,
  deleteFollow,
  deleteFriendRequest,
  deleteFriendship,
  feedFor,
  followersOf,
  followingOf,
  friendCount,
  friendsOf,
  getUsersByIds,
  incomingRequests,
  insertFollow,
  insertFriendRequest,
  isFollowing,
  outgoingRequests,
  pairStatus,
  searchUsers,
  unblockUser,
  type ActivityRow,
  type Database,
  type Since,
  type User,
} from '@chessmate/db';

/** Live state the game server knows and the social layer reads. */
export interface LiveSource {
  presence(userId: string): Presence;
  liveGames(userIds: Set<string>): LiveGameEntry[];
}

export type Notify = (userIds: string[], event: SocialEvent) => void;

/** A player's privacy settings (Settings → Privacy). */
export type PrivacyOf = (userId: string) => UserSettings['privacy'];

const OFFLINE: Presence = { status: 'offline' };

export class SocialError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}

export interface GameFinished {
  gameId: string;
  whiteId: string;
  blackId: string;
  result: string;
  reason: string;
  category: string;
  rated: boolean;
}

/** Accounts only: guests ("g_…") have no social graph. */
export const isAccountId = (id: string) => !id.startsWith('g_');

export const toSocialUser = (u: User): SocialUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName ?? u.username,
  country: u.country ?? null,
  avatarUrl: u.avatarUrl ?? null,
});

const ms = (d: Date | string) => new Date(d).getTime();

/**
 * Friends, follows, blocks, presence audience, spectating permission and the
 * activity feed. Storage is @chessmate/db; live state (who is online, which
 * games are running) comes from the game server through `attach`.
 */
export class SocialService {
  private live: LiveSource = { presence: () => ({ status: 'offline' }), liveGames: () => [] };
  private notify: Notify = () => {};

  private readonly privacyOf: PrivacyOf;

  constructor(
    private readonly db: Database,
    opts: { privacyOf?: PrivacyOf } = {},
  ) {
    this.privacyOf = opts.privacyOf ?? (() => DEFAULT_SETTINGS.privacy);
  }

  /** Live presence as others may see it: offline when the player hides their online status. */
  presenceFor(userId: string, presence: Presence = this.live.presence(userId)): Presence {
    return this.privacyOf(userId).showOnline ? presence : OFFLINE;
  }

  private async isFriend(a: string, b: string): Promise<boolean> {
    return (await pairStatus(this.db, a, b)).some((r) => r.status === 'accepted');
  }

  private async hasMutualFriend(a: string, b: string): Promise<boolean> {
    const [mine, theirs] = await Promise.all([friendsOf(this.db, a), friendsOf(this.db, b)]);
    const set = new Set(mine.map((r) => r.id));
    return theirs.some((r) => set.has(r.id));
  }

  attach(live: LiveSource, notify: Notify) {
    this.live = live;
    this.notify = notify;
  }

  // ---- lookups ----

  private async user(id: string): Promise<SocialUser | undefined> {
    const u = (await getUsersByIds(this.db, [id])).get(id);
    return u && toSocialUser(u);
  }

  /** Resolves another user, hiding anyone who blocked the viewer. */
  private async target(viewer: string, id: string): Promise<{ user: SocialUser; rel: Relationship & { blockedYou: boolean } }> {
    if (id === viewer) throw new SocialError(400, 'That is you');
    const user = await this.user(id);
    const rel = await this.relationship(viewer, id);
    if (!user || rel.blockedYou) throw new SocialError(404, 'User not found');
    return { user, rel };
  }

  private async hydrate(rows: Since[]): Promise<{ user: SocialUser; since: number }[]> {
    const found = await getUsersByIds(
      this.db,
      rows.map((r) => r.id),
    );
    return rows.flatMap((r) => {
      const u = found.get(r.id);
      return u ? [{ user: toSocialUser(u), since: ms(r.since) }] : [];
    });
  }

  async relationship(viewer: string, other: string): Promise<Relationship & { blockedYou: boolean }> {
    const rows = await pairStatus(this.db, viewer, other);
    const mine = rows.find((r) => r.requesterId === viewer);
    const theirs = rows.find((r) => r.requesterId === other);
    const [following, followsYou] = await Promise.all([isFollowing(this.db, viewer, other), isFollowing(this.db, other, viewer)]);
    return {
      friend: rows.some((r) => r.status === 'accepted'),
      request: theirs?.status === 'pending' ? 'incoming' : mine?.status === 'pending' ? 'outgoing' : null,
      following,
      followsYou,
      blocked: mine?.status === 'blocked',
      blockedYou: theirs?.status === 'blocked',
    };
  }

  private publicRel({ blockedYou: _, ...rel }: Relationship & { blockedYou: boolean }): Relationship {
    return rel;
  }

  async search(viewer: string, query: string): Promise<UserWithRelationship[]> {
    const q = query.trim().slice(0, 40);
    if (!q) return [];
    const hidden = await blockSet(this.db, viewer);
    const found = await searchUsers(this.db, q, SOCIAL_LIMITS.searchResults + hidden.size + 1);
    const out: UserWithRelationship[] = [];
    for (const u of found) {
      if (u.id === viewer || out.length >= SOCIAL_LIMITS.searchResults) continue;
      const rel = await this.relationship(viewer, u.id);
      if (rel.blockedYou) continue;
      // Players who opted out of search stay findable by their friends.
      if (!rel.friend && !this.privacyOf(u.id).searchable) continue;
      out.push({ ...toSocialUser(u), relationship: this.publicRel(rel) });
    }
    return out;
  }

  async profile(viewer: string, id: string) {
    const self = id === viewer;
    const { user, rel } = self
      ? { user: await this.user(id), rel: await this.relationship(viewer, id) }
      : await this.target(viewer, id);
    if (!user) throw new SocialError(404, 'User not found');
    const visible = self || rel.friend || rel.following;
    return {
      ...user,
      relationship: this.publicRel(rel),
      presence: visible && !rel.blocked ? (self ? this.live.presence(id) : this.presenceFor(id)) : null,
      friends: await friendCount(this.db, id),
      followers: (await followersOf(this.db, id)).length,
    };
  }

  // ---- friends ----

  async friends(viewer: string): Promise<FriendEntry[]> {
    const order = { playing: 0, online: 1, offline: 2 } as const;
    return (await this.hydrate(await friendsOf(this.db, viewer)))
      .map(({ user, since }) => ({ user, since, presence: this.presenceFor(user.id) }))
      .sort((a, b) => order[a.presence.status] - order[b.presence.status] || a.user.username.localeCompare(b.user.username));
  }

  async requests(viewer: string): Promise<{ incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] }> {
    const [inc, out] = await Promise.all([incomingRequests(this.db, viewer), outgoingRequests(this.db, viewer)]);
    const map = async (rows: Since[]) => (await this.hydrate(rows)).map(({ user, since }) => ({ user, createdAt: since }));
    return { incoming: await map(inc), outgoing: await map(out) };
  }

  /** Sends a request, or accepts theirs if they already asked. */
  async sendRequest(viewer: string, to: string): Promise<{ status: 'sent' | 'accepted' }> {
    const { user: target, rel } = await this.target(viewer, to);
    if (rel.blocked) throw new SocialError(409, 'Unblock this player first');
    if (rel.friend) throw new SocialError(409, 'Already friends');
    if (rel.request === 'incoming') {
      await this.acceptRequest(viewer, to);
      return { status: 'accepted' };
    }
    if (rel.request === 'outgoing') return { status: 'sent' };
    const audience = this.privacyOf(to).friendRequests;
    if (audience === 'nobody') throw new SocialError(403, 'This player does not accept friend requests');
    if (audience === 'friendsOfFriends' && !(await this.hasMutualFriend(viewer, to))) {
      throw new SocialError(403, 'Only friends of friends can send this player a request');
    }
    if ((await outgoingRequests(this.db, viewer)).length >= SOCIAL_LIMITS.maxOutgoingRequests) {
      throw new SocialError(429, 'Too many pending requests');
    }
    if ((await friendCount(this.db, viewer)) >= SOCIAL_LIMITS.maxFriends) throw new SocialError(409, 'Friend list is full');
    await insertFriendRequest(this.db, viewer, to);
    const me = await this.user(viewer);
    if (me) this.notify([target.id], { kind: 'friendRequest', from: me });
    return { status: 'sent' };
  }

  async acceptRequest(viewer: string, from: string) {
    if ((await friendCount(this.db, viewer)) >= SOCIAL_LIMITS.maxFriends) throw new SocialError(409, 'Friend list is full');
    if (!(await acceptFriendRequest(this.db, from, viewer))) throw new SocialError(404, 'No such request');
    await addActivity(this.db, 'friendship', viewer, from);
    const me = await this.user(viewer);
    if (me) this.notify([from], { kind: 'friendAccepted', by: me });
  }

  async declineRequest(viewer: string, from: string) {
    if (!(await deleteFriendRequest(this.db, from, viewer))) throw new SocialError(404, 'No such request');
  }

  async cancelRequest(viewer: string, to: string) {
    if (!(await deleteFriendRequest(this.db, viewer, to))) throw new SocialError(404, 'No such request');
  }

  async unfriend(viewer: string, other: string) {
    if (!(await deleteFriendship(this.db, viewer, other))) throw new SocialError(404, 'Not friends');
    this.notify([other], { kind: 'friendRemoved', userId: viewer });
  }

  // ---- follows ----

  async follow(viewer: string, id: string) {
    const { rel } = await this.target(viewer, id);
    if (rel.blocked) throw new SocialError(409, 'Unblock this player first');
    if (!rel.following && !this.privacyOf(id).allowFollows) throw new SocialError(403, 'This player does not accept followers');
    if (await insertFollow(this.db, viewer, id)) await addActivity(this.db, 'follow', viewer, id);
  }

  async unfollow(viewer: string, id: string) {
    await deleteFollow(this.db, viewer, id);
  }

  async following(viewer: string) {
    return (await this.hydrate(await followingOf(this.db, viewer))).map((x) => ({ ...x, presence: this.presenceFor(x.user.id) }));
  }

  async followers(viewer: string) {
    const hidden = await blockSet(this.db, viewer);
    return this.hydrate((await followersOf(this.db, viewer)).filter((r) => !hidden.has(r.id)));
  }

  // ---- blocks ----

  async block(viewer: string, id: string) {
    if (id === viewer) throw new SocialError(400, 'That is you');
    if (!(await this.user(id))) throw new SocialError(404, 'User not found');
    const { wasFriend } = await blockUser(this.db, viewer, id);
    // Their client drops us from the list; the block itself is never revealed.
    if (wasFriend) this.notify([id], { kind: 'friendRemoved', userId: viewer });
  }

  async unblock(viewer: string, id: string) {
    await unblockUser(this.db, viewer, id);
  }

  async blocked(viewer: string) {
    return this.hydrate(await blockedBy(this.db, viewer));
  }

  // ---- presence and spectating ----

  /** Who hears about this user's presence: friends and followers, minus blocks. */
  async audience(userId: string): Promise<string[]> {
    if (!isAccountId(userId)) return [];
    const [friends, followers, hidden] = await Promise.all([
      friendsOf(this.db, userId),
      followersOf(this.db, userId),
      blockSet(this.db, userId),
    ]);
    return [...new Set([...friends, ...followers].map((r) => r.id))].filter((id) => !hidden.has(id));
  }

  /** Live games of friends and followed players. */
  async liveGames(viewer: string): Promise<LiveGameEntry[]> {
    const [friends, following, hidden] = await Promise.all([
      friendsOf(this.db, viewer),
      followingOf(this.db, viewer),
      blockSet(this.db, viewer),
    ]);
    const friendIds = new Set(friends.map((r) => r.id));
    const ids = new Set([...friends, ...following].map((r) => r.id));
    return this.live.liveGames(ids).filter((g) => {
      if (hidden.has(g.white.id) || hidden.has(g.black.id)) return false;
      // Listed because of someone you know: only if they show that they are playing.
      if (![g.white.id, g.black.id].some((id) => ids.has(id) && this.privacyOf(id).showOnline)) return false;
      return [g.white.id, g.black.id].every((id) => audienceAllows(this.privacyOf(id).spectators, { friend: friendIds.has(id) }));
    });
  }

  /**
   * Who may watch a live game: nobody in a block with either player, and only
   * the audience both players allow (Settings → Privacy → Who can watch my games).
   */
  async canWatch(viewer: string, whiteId: string, blackId: string): Promise<boolean> {
    const players = [whiteId, blackId];
    if (!isAccountId(viewer)) return players.every((id) => !isAccountId(id) || this.privacyOf(id).spectators === 'everyone');
    const hidden = await blockSet(this.db, viewer);
    if (hidden.has(whiteId) || hidden.has(blackId)) return false;
    for (const id of players) {
      if (!isAccountId(id) || id === viewer) continue;
      const setting = this.privacyOf(id).spectators;
      if (setting === 'everyone') continue;
      if (!audienceAllows(setting, { friend: await this.isFriend(viewer, id) })) return false;
    }
    return true;
  }

  /**
   * Whether `from` may send `to` a direct challenge, or the reason not.
   * Invite links are not checked here: the owner chooses who gets the link.
   */
  async canChallenge(from: string, to: string): Promise<string | null> {
    if (!isAccountId(to) || from === to) return null;
    const setting = this.privacyOf(to).challenges;
    if (setting === 'nobody') return 'This player does not accept challenges';
    if (!isAccountId(from)) return setting === 'everyone' ? null : 'Only friends can challenge this player';
    const rel = await this.relationship(from, to);
    if (rel.blocked || rel.blockedYou) return 'You cannot challenge this player';
    if (!audienceAllows(setting, { friend: rel.friend })) return 'Only friends can challenge this player';
    return null;
  }

  // ---- activity ----

  async recordGame(g: GameFinished) {
    if (!isAccountId(g.whiteId) || !isAccountId(g.blackId)) return;
    const { whiteId, blackId, ...data } = g;
    const known = await getUsersByIds(this.db, [whiteId, blackId]);
    if (known.size < 2) return;
    await addActivity(this.db, 'game', whiteId, blackId, data);
  }

  async feed(viewer: string, before?: number): Promise<{ items: FeedItem[]; next: number | null }> {
    const rows = await feedFor(this.db, viewer, SOCIAL_LIMITS.feedPage, before ? new Date(before) : undefined);
    const found = await getUsersByIds(
      this.db,
      rows.flatMap((r) => (r.subjectId ? [r.actorId, r.subjectId] : [r.actorId])),
    );
    const items = rows.map((r) => toFeedItem(r, found)).filter((x): x is FeedItem => !!x);
    const last = rows[rows.length - 1];
    return { items, next: rows.length === SOCIAL_LIMITS.feedPage && last ? ms(last.createdAt) : null };
  }
}

function toFeedItem(r: ActivityRow, users: Map<string, User>): FeedItem | null {
  const actor = users.get(r.actorId);
  const subject = r.subjectId ? users.get(r.subjectId) : undefined;
  if (!actor || !subject) return null;
  const base = { id: r.id, at: ms(r.createdAt) };
  switch (r.kind) {
    case 'game': {
      const d = r.data as Omit<GameFinished, 'whiteId' | 'blackId'>;
      return { ...base, kind: 'game', white: toSocialUser(actor), black: toSocialUser(subject), ...d };
    }
    case 'friendship':
      return { ...base, kind: 'friendship', a: toSocialUser(actor), b: toSocialUser(subject) };
    case 'follow':
      return { ...base, kind: 'follow', follower: toSocialUser(actor), followee: toSocialUser(subject) };
    default:
      return null;
  }
}
