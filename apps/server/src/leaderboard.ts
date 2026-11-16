import { isProvisional, type TimeCategory } from '@chessmate/core';
import type { DatabaseSync } from 'node:sqlite';
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
  page(f: BoardFilter, limit: number, offset: number): { total: number; entries: LeaderboardEntry[] };
  /** One player's ranked row on the board, or null when they are not on it. */
  standing(f: BoardFilter, userId: string): LeaderboardEntry | null;
  countryOf(userId: string): string | null;
  friendIdsOf(userId: string): string[];
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

  get(q: LeaderboardQuery): LeaderboardPage {
    if (!LEADERBOARD_CATEGORIES.includes(q.category)) throw new LeaderboardError(400, 'Unknown rating category');
    if (!LEADERBOARD_SCOPES.includes(q.scope)) throw new LeaderboardError(400, 'Unknown leaderboard scope');
    const limit = clampInt(q.limit ?? 50, 1, MAX_LIMIT);
    const offset = clampInt(q.offset ?? 0, 0, 1_000_000);
    const viewerId = q.viewerId ?? null;

    let country: string | null = null;
    let filter: BoardFilter;
    if (q.scope === 'friends') {
      if (!viewerId) throw new LeaderboardError(401, 'Sign in to see your friends leaderboard');
      const ids = [viewerId, ...this.source.friendIdsOf(viewerId)];
      filter = { category: q.category, userIds: [...new Set(ids)], includeProvisional: true };
    } else if (q.scope === 'country') {
      country = normalizeCountry(q.country) ?? (viewerId ? normalizeCountry(this.source.countryOf(viewerId)) : null);
      if (!country) throw new LeaderboardError(400, 'Pick a country, or set one on your profile');
      filter = { category: q.category, country, includeProvisional: false };
    } else {
      filter = { category: q.category, includeProvisional: false };
    }

    const { total, entries } = this.source.page(filter, limit, offset);
    const you = viewerId ? (entries.find((e) => e.userId === viewerId) ?? this.source.standing(filter, viewerId)) : null;
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
 * SQLite source over the accounts schema (`users` and `ratings` tables).
 * Ranks with a window function over ROUND(rating), so ties match
 * `rankRows`. Friends come from a callback so this does not depend on how
 * the social module stores friendships.
 */
export class SqlLeaderboardSource implements LeaderboardSource {
  constructor(
    private readonly sql: DatabaseSync,
    private readonly friends: (userId: string) => string[] = () => [],
  ) {
    // Deleted accounts never appear, when the schema soft-deletes users.
    const cols = sql.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    this.softDelete = cols.some((c) => c.name === 'deleted_at');
  }

  private readonly softDelete: boolean;

  private ranked(f: BoardFilter): { cte: string; args: (string | number)[] } | null {
    const where = ['r.category = ?', 'r.games > 0'];
    if (this.softDelete) where.push('u.deleted_at IS NULL');
    const args: (string | number)[] = [f.category];
    if (!f.includeProvisional) {
      where.push('r.rd <= ?');
      args.push(MAX_RANKED_RD);
    }
    if (f.country) {
      where.push('u.country = ? COLLATE NOCASE');
      args.push(f.country);
    }
    if (f.userIds) {
      if (f.userIds.length === 0) return null;
      where.push(`r.user_id IN (${f.userIds.map(() => '?').join(', ')})`);
      args.push(...f.userIds);
    }
    const cte = `WITH board AS (
      SELECT RANK() OVER (ORDER BY ROUND(r.rating) DESC) AS rank,
             ROW_NUMBER() OVER (ORDER BY r.rating DESC, r.games DESC, u.username) AS pos,
             r.user_id AS userId, u.username, u.display_name AS displayName, u.country, r.rating, r.rd,
             r.games, r.wins, r.losses, r.draws, r.peak
      FROM ratings r JOIN users u ON u.id = r.user_id
      WHERE ${where.join(' AND ')})`;
    return { cte, args };
  }

  page(f: BoardFilter, limit: number, offset: number) {
    const q = this.ranked(f);
    if (!q) return { total: 0, entries: [] };
    const total = (this.sql.prepare(`${q.cte} SELECT COUNT(*) AS n FROM board`).get(...q.args) as { n: number }).n;
    const rows = this.sql.prepare(`${q.cte} SELECT * FROM board ORDER BY pos LIMIT ? OFFSET ?`).all(...q.args, limit, offset);
    return { total, entries: (rows as unknown as (RankedRow & { rank: number })[]).map(toEntry) };
  }

  standing(f: BoardFilter, userId: string) {
    const q = this.ranked(f);
    if (!q) return null;
    const row = this.sql.prepare(`${q.cte} SELECT * FROM board WHERE userId = ?`).get(...q.args, userId);
    return row ? toEntry(row as unknown as RankedRow & { rank: number }) : null;
  }

  countryOf(userId: string): string | null {
    const row = this.sql.prepare('SELECT country FROM users WHERE id = ?').get(userId) as { country: string | null } | undefined;
    return row?.country ?? null;
  }

  friendIdsOf(userId: string): string[] {
    return this.friends(userId);
  }
}

function toEntry(r: RankedRow & { rank: number }): LeaderboardEntry {
  return {
    rank: Number(r.rank),
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    country: r.country,
    rating: Math.round(r.rating),
    provisional: isProvisional({ rating: r.rating, rd: r.rd, volatility: 0 }),
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    peak: Math.round(r.peak),
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

  page(f: BoardFilter, limit: number, offset: number) {
    return pageRows(this.rows(f), limit, offset);
  }

  standing(f: BoardFilter, userId: string) {
    return rankRows(this.rows(f)).find((e) => e.userId === userId) ?? null;
  }

  countryOf(userId: string): string | null {
    for (const p of this.players()) if (p.id === userId) return p.country ?? null;
    return null;
  }

  friendIdsOf(userId: string): string[] {
    return this.friends(userId);
  }
}
