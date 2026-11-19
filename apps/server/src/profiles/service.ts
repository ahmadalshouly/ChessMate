import {
  DEFAULT_AVATAR,
  DEFAULT_RATING,
  DEFAULT_SETTINGS,
  RATED_CATEGORIES,
  applySettingsPatch,
  formatTimeControl,
  isProvisional,
  type CategoryStats,
  type MyProfile,
  type ProfileEdit,
  type PublicProfile,
  type RatingPoint,
  type RecentGame,
  type TimeCategory,
  type UserSettings,
} from '@chessmate/core';
import type { AccountUser, FinishedGame, ProfileDeps, ProfileRecord, ProfileStore } from './types';

const RECENT_GAMES = 10;
const HISTORY_GAMES = 1000;

export class ProfileService {
  constructor(
    private readonly deps: ProfileDeps,
    private readonly store: ProfileStore,
    private readonly now: () => number = Date.now,
  ) {}

  async record(userId: string): Promise<ProfileRecord> {
    return (
      (await this.store.get(userId)) ?? {
        userId,
        displayName: null,
        bio: null,
        country: null,
        avatar: DEFAULT_AVATAR,
        settings: structuredClone(DEFAULT_SETTINGS),
        updatedAt: 0,
      }
    );
  }

  async publicProfile(user: AccountUser, viewerId: string | null): Promise<PublicProfile> {
    const rec = await this.record(user.id);
    const isMe = viewerId === user.id;
    const rows = await this.deps.ratings(user.id);
    const ratings: CategoryStats[] = RATED_CATEGORIES.map((category) => {
      const r = rows.find((x) => x.category === category);
      const base = r ?? { ...DEFAULT_RATING, peak: DEFAULT_RATING.rating, games: 0, wins: 0, losses: 0, draws: 0 };
      return {
        category,
        rating: Math.round(base.rating),
        rd: Math.round(base.rd),
        provisional: isProvisional({ rating: base.rating, rd: base.rd, volatility: 0 }),
        peak: Math.round(base.peak),
        games: base.games,
        wins: base.wins,
        losses: base.losses,
        draws: base.draws,
      };
    });
    const totals = ratings.reduce((t, r) => ({ games: t.games + r.games, wins: t.wins + r.wins, losses: t.losses + r.losses, draws: t.draws + r.draws }), {
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
    const privacy = rec.settings.privacy;
    const showGames = isMe || privacy.showGames;
    const recentGames = showGames ? (await this.deps.games(user.id, RECENT_GAMES)).map((g) => toRecent(g, user.id)) : null;
    const online = isMe || privacy.showOnline ? (this.deps.isOnline?.(user.id) ?? null) : null;
    return {
      id: user.id,
      title: this.deps.titleOf?.(user.id) ?? null,
      roleTag: this.deps.roleTagOf?.(user.id) ?? null,
      playerTag: rec.playerTag ?? null,
      username: user.username,
      displayName: rec.displayName ?? user.username,
      avatar: rec.avatar,
      bio: rec.bio,
      country: rec.country,
      createdAt: user.createdAt,
      online,
      ratings,
      totals,
      recentGames,
      isMe,
    };
  }

  async myProfile(user: AccountUser): Promise<MyProfile> {
    return { ...(await this.publicProfile(user, user.id)), email: user.email, settings: (await this.record(user.id)).settings };
  }

  /** Rating after each rated game in a category, oldest first. Null when hidden. */
  async ratingHistory(userId: string, category: TimeCategory, viewerId: string | null): Promise<RatingPoint[] | null> {
    const rec = await this.record(userId);
    if (viewerId !== userId && !rec.settings.privacy.showRatingHistory) return null;
    const games = await this.deps.games(userId, HISTORY_GAMES);
    const points: RatingPoint[] = [];
    for (const g of games) {
      if (!g.rated || g.category !== category) continue;
      const white = g.whiteId === userId;
      const before = white ? g.whiteRating : g.blackRating;
      const delta = white ? g.whiteDelta : g.blackDelta;
      if (delta === null) continue;
      points.push({ t: g.endedAt, rating: before + delta, gameId: g.id });
    }
    return points.reverse();
  }

  async updateProfile(userId: string, edit: ProfileEdit): Promise<ProfileRecord> {
    const rec = await this.record(userId);
    const next: ProfileRecord = {
      ...rec,
      displayName: edit.displayName ?? rec.displayName,
      bio: edit.bio === undefined ? rec.bio : edit.bio,
      country: edit.country === undefined ? rec.country : edit.country,
      avatar: edit.avatar ?? rec.avatar,
      playerTag: edit.playerTag === undefined ? (rec.playerTag ?? null) : edit.playerTag,
      updatedAt: this.now(),
    };
    await this.store.save(next);
    return next;
  }

  async updateSettings(userId: string, patch: unknown): Promise<{ settings: UserSettings } | { error: string }> {
    const rec = await this.record(userId);
    const res = applySettingsPatch(rec.settings, patch);
    if ('settings' in res) await this.store.save({ ...rec, settings: res.settings, updatedAt: this.now() });
    return res;
  }

  /** Called after the account itself is deleted. */
  async forget(userId: string) {
    await this.store.delete(userId);
  }
}

export function toRecent(g: FinishedGame, userId: string): RecentGame {
  const color = g.whiteId === userId ? 'w' : 'b';
  const score = g.result === '1-0' ? 1 : g.result === '0-1' ? 0 : 0.5;
  const mine = color === 'w' ? score : 1 - score;
  return {
    id: g.id,
    category: g.category,
    timeControl: formatTimeControl({ initialMs: g.initialMs, incrementMs: g.incrementMs }),
    rated: g.rated,
    color,
    opponent: color === 'w' ? { username: g.blackName, rating: g.blackRating } : { username: g.whiteName, rating: g.whiteRating },
    result: g.result,
    outcome: mine === 1 ? 'win' : mine === 0 ? 'loss' : 'draw',
    reason: g.reason,
    ratingDelta: color === 'w' ? g.whiteDelta : g.blackDelta,
    moves: Math.ceil(g.moves.length / 2),
    endedAt: g.endedAt,
  };
}
