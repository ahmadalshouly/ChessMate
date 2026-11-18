import { isProvisional, type TimeCategory } from '@chessmate/core';
import { friendships, ratings, users, type Database } from '@chessmate/db';
import { and, count, eq, inArray, isNull, lte, gt, or, sql, type SQL } from 'drizzle-orm';
import type { Player } from './players';

/** Rating categories shown on leaderboards (correspondence is not played live yet). */
export const LEADERBOARD_CATEGORIES: readonly TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];
export type LeaderboardScope = 'global' | 'country' | 'friends';
export const LEADERBOARD_SCOPES: readonly LeaderboardScope[] = ['global', 'country', 'friends'];

/**
 * Who appears on a leaderboard: at least one rated game in the category and
 * a settled rating (Glicko RD at or below this). Provisional players are
 * left out of global and country boards so a lucky first game cannot top
 * the list; friends boards include everyone with a rated game.
 */
export const MAX_RANKED_RD = 150;

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  country: string | null;
  rating: number;
  provisional: boolean;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  peak: number;
}

export interface LeaderboardQuery {
  category: TimeCategory;
  scope: LeaderboardScope;
  /** ISO 3166-1 alpha-2 code; defaults to the viewer's country for scope=country. */
  country?: string | null;
  /** Signed-in viewer, needed for scope=friends and for the "you" row. */
  viewerId?: string | null;
  limit?: number;
  offset?: number;
}

export interface LeaderboardPage {
  category: TimeCategory;
  scope: LeaderboardScope;
  country: string | null;
  total: number;
  offset: number;
  entries: LeaderboardEntry[];
  /** The viewer's own row and rank on this board, when they are on it. */
  you: LeaderboardEntry | null;
}

/** One player's standing in one category, as storage returns it. */
export interface RankedRow {
  userId: string;
  username: string;
  displayName: string;
  country: string | null;
  rating: number;
  rd: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  peak: number;
}

export interface BoardFilter {
  category: TimeCategory;
  country?: string;
  userIds?: string[];
  includeProvisional: boolean;
}

/**
 * Storage boundary for leaderboards. Implementations rank inside the
 * database so a page costs the same however many players there are.
 */
export interface LeaderboardSource {
  /** One page of the board, ranked, plus how many players are on it. */
  page(f: BoardFilter, limit: number, offset: number): Promise<{ total: number; entries: LeaderboardEntry[] }>;
  /** One player's ranked row on the board, or null when they are not on it. */
  standing(f: BoardFilter, userId: string): Promise<LeaderboardEntry | null>;
  countryOf(userId: string): Promise<string | null>;
  /** Accepted friends, in either direction. */
  friendIdsOf(userId: string): Promise<string[]>;
}

export class LeaderboardError extends Error {
  constructor(
    readonly status: 400 | 401,
    message: string,
  ) {
    super(message);
  }
}

const MAX_LIMIT = 100;

export class Leaderboards {
  constructor(private readonly source: LeaderboardSource) {}

  async get(q: LeaderboardQuery): Promise<LeaderboardPage> {
    if (!LEADERBOARD_CATEGORIES.includes(q.category)) throw new LeaderboardError(400, 'Unknown rating category');
    if (!LEADERBOARD_SCOPES.includes(q.scope)) throw new LeaderboardError(400, 'Unknown leaderboard scope');
    const limit = clampInt(q.limit ?? 50, 1, MAX_LIMIT);
    const offset = clampInt(q.offset ?? 0, 0, 1_000_000);
    const viewerId = q.viewerId ?? null;

    let country: string | null = null;
    let filter: BoardFilter;
    if (q.scope === 'friends') {
      if (!viewerId) throw new LeaderboardError(401, 'Sign in to see your friends leaderboard');
      const ids = [viewerId, ...(await this.source.friendIdsOf(viewerId))];
      filter = { category: q.category, userIds: [...new Set(ids)], includeProvisional: true };
    } else if (q.scope === 'country') {
      country = normalizeCountry(q.country) ?? (viewerId ? normalizeCountry(await this.source.countryOf(viewerId)) : null);
      if (!country) throw new LeaderboardError(400, 'Pick a country, or set one on your profile');
      filter = { category: q.category, country, includeProvisional: false };
    } else {
      filter = { category: q.category, includeProvisional: false };
    }

    const { total, entries } = await this.source.page(filter, limit, offset);
    const you = viewerId ? (entries.find((e) => e.userId === viewerId) ?? (await this.source.standing(filter, viewerId))) : null;
    return { category: q.category, scope: q.scope, country, total, offset, entries, you };
  }
}

/** Standard competition ranking ("1224"): equal rounded ratings share a rank. */
export function rankRows(rows: RankedRow[]): LeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => b.rating - a.rating || b.games - a.games || a.username.localeCompare(b.username));
  let prev: number | null = null;
  let rank = 0;
  return sorted.map((r, i) => {
    const rating = Math.round(r.rating);
    if (rating !== prev) {
      rank = i + 1;
      prev = rating;
    }
    return toEntry({ ...r, rank });
  });
}

export function normalizeCountry(c: string | null | undefined): string | null {
  if (typeof c !== 'string') return null;
  const up = c.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(up) ? up : null;
}

function clampInt(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : lo;
}

// ---- implementations ----

/** In-memory paging over already filtered rows; used by the memory source and tests. */
export function pageRows(rows: RankedRow[], limit: number, offset: number) {
  const ranked = rankRows(rows);
  return { total: ranked.length, entries: ranked.slice(offset, offset + limit) };
}

/**
 * Postgres source (Drizzle, works on PGlite too) over `users`, `ratings`
 * and `friendships` from @chessmate/db. Ranks with window functions over
 * round(rating), so ties match `rankRows`; the (category, rating) index
 * covers the scan. Soft-deleted users never appear.
 */
export class DbLeaderboardSource implements LeaderboardSource {
  constructor(private readonly db: Database) {}

  private where(f: BoardFilter): SQL | null {
    const conds: SQL[] = [eq(ratings.category, f.category as never), gt(ratings.games, 0), isNull(users.deletedAt), isNull(users.closedAt)];
    if (!f.includeProvisional) conds.push(lte(ratings.rd, MAX_RANKED_RD));
    if (f.country) conds.push(sql`upper(${users.country}) = ${f.country}`);
    if (f.userIds) {
      if (f.userIds.length === 0) return null;
      conds.push(inArray(ratings.userId, f.userIds));
    }
    return and(...conds)!;
  }

  private board(where: SQL) {
    return this.db
      .select({
        rank: sql<number>`rank() over (order by round(${ratings.rating}) desc)`.as('rank'),
        pos: sql<number>`row_number() over (order by ${ratings.rating} desc, ${ratings.games} desc, ${users.username})`.as('pos'),
        userId: sql<string>`${ratings.userId}`.as('user_id'),
        username: users.username,
        displayName: sql<string>`coalesce(${users.displayName}, ${users.username})`.as('display_name'),
        country: users.country,
        rating: ratings.rating,
        rd: ratings.rd,
        games: ratings.games,
        wins: ratings.wins,
        losses: ratings.losses,
        draws: ratings.draws,
        peak: sql<number>`coalesce(${ratings.peak}, ${ratings.rating})`.as('peak'),
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(where)
      .as('board');
  }

  async page(f: BoardFilter, limit: number, offset: number) {
    const where = this.where(f);
    if (!where) return { total: 0, entries: [] };
    const [{ n }] = (await this.db.select({ n: count() }).from(ratings).innerJoin(users, eq(users.id, ratings.userId)).where(where)) as [{ n: number }];
    const b = this.board(where);
    const rows = await this.db.select().from(b).orderBy(b.pos).limit(limit).offset(offset);
    return { total: Number(n), entries: rows.map(toEntry) };
  }

  async standing(f: BoardFilter, userId: string) {
    const where = this.where(f);
    if (!where) return null;
    const b = this.board(where);
    const [row] = await this.db.select().from(b).where(eq(b.userId, userId));
    return row ? toEntry(row) : null;
  }

  async countryOf(userId: string) {
    const [row] = await this.db.select({ country: users.country }).from(users).where(eq(users.id, userId));
    return row?.country ?? null;
  }

  async friendIdsOf(userId: string) {
    const rows = await this.db
      .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
      .from(friendships)
      .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))));
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }
}

function toEntry(r: RankedRow & { rank: number | string }): LeaderboardEntry {
  return {
    rank: Number(r.rank),
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    country: r.country,
    rating: Math.round(r.rating),
    provisional: isProvisional({ rating: r.rating, rd: r.rd, volatility: 0 }),
    games: Number(r.games),
    wins: Number(r.wins),
    losses: Number(r.losses),
    draws: Number(r.draws),
    peak: Math.round(Number(r.peak)),
  };
}

/**
 * Source over the in-memory player store, so leaderboards work in local
 * development before accounts are wired in. Guests are never ranked.
 */
export class MemoryLeaderboardSource implements LeaderboardSource {
  constructor(
    private readonly players: () => Iterable<Player & { country?: string | null }>,
    private readonly friends: (userId: string) => string[] = () => [],
  ) {}

  private rows(f: BoardFilter): RankedRow[] {
    const ids = f.userIds ? new Set(f.userIds) : null;
    const out: RankedRow[] = [];
    for (const p of this.players()) {
      if (p.id.startsWith('g_')) continue;
      const r = p.ratings[f.category];
      if (!r || r.rd >= 350) continue; // no rated game in this category yet
      if (!f.includeProvisional && r.rd > MAX_RANKED_RD) continue;
      if (ids && !ids.has(p.id)) continue;
      if (f.country && normalizeCountry(p.country) !== f.country) continue;
      out.push({ userId: p.id, username: p.name, displayName: p.name, country: p.country ?? null, rating: r.rating, rd: r.rd, games: 0, wins: 0, losses: 0, draws: 0, peak: r.rating });
    }
    return out;
  }

  async page(f: BoardFilter, limit: number, offset: number) {
    return pageRows(this.rows(f), limit, offset);
  }

  async standing(f: BoardFilter, userId: string) {
    return rankRows(this.rows(f)).find((e) => e.userId === userId) ?? null;
  }

  async countryOf(userId: string) {
    for (const p of this.players()) if (p.id === userId) return p.country ?? null;
    return null;
  }

  async friendIdsOf(userId: string) {
    return this.friends(userId);
  }
}
