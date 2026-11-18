import { and, desc, eq, gte, ilike, isNotNull, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import {
  adminAuditLog,
  chatBans,
  games,
  moderationReports,
  playerWarnings,
  users,
  type AdminAuditRow,
  type GameRow,
  type PlayerWarningRow,
  type User,
  type UserRole,
} from '../schema';

// ---------------------------------------------------------------- players

export interface UserSearch {
  /** Matches username or email (substring, case-insensitive), or an exact id. */
  query?: string;
  status?: 'all' | 'active' | 'closed';
  /** "staff" = moderators and admins. */
  role?: UserRole | 'staff';
  limit?: number;
  offset?: number;
}

/** Staff search over accounts, newest first. Soft-deleted accounts are left out. */
export async function adminSearchUsers(db: Database, f: UserSearch = {}): Promise<{ rows: User[]; total: number }> {
  const conds: SQL[] = [isNull(users.deletedAt)];
  const q = f.query?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(users.username, like), ilike(users.email, like), ilike(users.displayName, like), eq(users.id, q))!);
  }
  if (f.status === 'active') conds.push(isNull(users.closedAt));
  if (f.status === 'closed') conds.push(isNotNull(users.closedAt));
  if (f.role === 'staff') conds.push(ne(users.role, 'user'));
  else if (f.role) conds.push(eq(users.role, f.role));
  const where = and(...conds);
  const limit = Math.min(Math.max(f.limit ?? 25, 1), 100);
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(Math.max(f.offset ?? 0, 0));
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  return { rows, total: count?.n ?? rows.length };
}

/** Moderators and admins, for the server's role cache. */
export async function listStaff(db: Database): Promise<{ id: string; username: string; role: UserRole }[]> {
  return db.select({ id: users.id, username: users.username, role: users.role }).from(users).where(and(ne(users.role, 'user'), isNull(users.deletedAt)));
}

/** Closed accounts, for the server's sign-in guard. */
export async function listClosedUsers(db: Database): Promise<{ id: string; reason: string | null }[]> {
  return db.select({ id: users.id, reason: users.closedReason }).from(users).where(isNotNull(users.closedAt));
}

export async function setUserRole(db: Database, id: string, role: UserRole): Promise<void> {
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function closeUserAccount(db: Database, id: string, c: { reason: string; note?: string | null; by: string; at?: Date }): Promise<void> {
  await db
    .update(users)
    .set({ closedAt: c.at ?? new Date(), closedReason: c.reason, closedNote: c.note ?? null, closedBy: c.by, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function reopenUserAccount(db: Database, id: string): Promise<void> {
  await db.update(users).set({ closedAt: null, closedReason: null, closedNote: null, closedBy: null, updatedAt: new Date() }).where(eq(users.id, id));
}

// ---------------------------------------------------------------- audit log

export interface AuditInput {
  actorId: string;
  actorName: string;
  action: string;
  targetType: 'user' | 'report' | 'game' | 'case' | 'tournament' | 'system';
  targetId?: string | null;
  targetName?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
  at?: Date;
}

export async function insertAudit(db: Database, e: AuditInput): Promise<AdminAuditRow> {
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      actorId: e.actorId,
      actorName: e.actorName,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId ?? null,
      targetName: e.targetName ?? null,
      reason: e.reason ?? null,
      details: e.details ?? {},
      ...(e.at ? { createdAt: e.at } : {}),
    })
    .returning();
  return row!;
}

export interface AuditQuery {
  targetId?: string;
  actorId?: string;
  /** "account" matches account.close, account.reopen... */
  actionPrefix?: string;
  before?: Date;
  limit?: number;
}

/** Newest first. Page with the last row's createdAt as `before`. */
export async function listAudit(db: Database, q: AuditQuery = {}): Promise<AdminAuditRow[]> {
  const conds: SQL[] = [];
  if (q.targetId) conds.push(eq(adminAuditLog.targetId, q.targetId));
  if (q.actorId) conds.push(eq(adminAuditLog.actorId, q.actorId));
  if (q.actionPrefix) conds.push(ilike(adminAuditLog.action, `${q.actionPrefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (q.before) conds.push(lt(adminAuditLog.createdAt, q.before));
  return db
    .select()
    .from(adminAuditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(Math.min(Math.max(q.limit ?? 50, 1), 200));
}

// ---------------------------------------------------------------- warnings

export async function insertWarning(
  db: Database,
  w: { userId: string; category: string; message: string; issuedBy: string; issuedByName: string; reportId?: string | null },
): Promise<PlayerWarningRow> {
  const [row] = await db.insert(playerWarnings).values(w).returning();
  return row!;
}

export async function listWarnings(db: Database, userId: string): Promise<PlayerWarningRow[]> {
  return db.select().from(playerWarnings).where(eq(playerWarnings.userId, userId)).orderBy(desc(playerWarnings.createdAt));
}

// ---------------------------------------------------------------- games

/** Recent games for the staff game browser, newest first. */
export async function listRecentGames(db: Database, opts: { userId?: string; limit?: number; before?: Date } = {}): Promise<GameRow[]> {
  const conds: SQL[] = [];
  if (opts.userId) conds.push(or(eq(games.whiteUserId, opts.userId), eq(games.blackUserId, opts.userId))!);
  if (opts.before) conds.push(lt(games.startedAt, opts.before));
  return db
    .select()
    .from(games)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(games.startedAt))
    .limit(Math.min(Math.max(opts.limit ?? 30, 1), 100));
}

// ---------------------------------------------------------------- dashboard

export interface AdminCounts {
  users: number;
  newUsers24h: number;
  newUsers7d: number;
  closedAccounts: number;
  staff: number;
  games24h: number;
  ratedGames24h: number;
  gamesTotal: number;
  warnings7d: number;
  /** Last `days` days, oldest first, as YYYY-MM-DD in UTC. */
  daily: { day: string; signups: number; games: number }[];
}

export async function adminCounts(db: Database, now = new Date(), days = 14): Promise<AdminCounts> {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const DAY = 24 * 3600_000;
  const count = async (table: typeof users | typeof games | typeof playerWarnings, where?: SQL) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
    return r?.n ?? 0;
  };
  const live = isNull(users.deletedAt);
  const [usersN, new24, new7, closed, staff, g24, rated24, gTotal, warn7] = await Promise.all([
    count(users, live),
    count(users, and(live, gte(users.createdAt, ago(DAY)))),
    count(users, and(live, gte(users.createdAt, ago(7 * DAY)))),
    count(users, and(live, isNotNull(users.closedAt))),
    count(users, and(live, ne(users.role, 'user'))),
    count(games, and(gte(games.startedAt, ago(DAY)), ne(games.status, 'aborted'))),
    count(games, and(gte(games.startedAt, ago(DAY)), ne(games.status, 'aborted'), eq(games.rated, true))),
    count(games, eq(games.status, 'finished')),
    count(playerWarnings, gte(playerWarnings.createdAt, ago(7 * DAY))),
  ]);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY);
  const dayOf = (col: typeof users.createdAt | typeof games.startedAt) => sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;
  const signups = await db
    .select({ day: dayOf(users.createdAt), n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(live, gte(users.createdAt, since)))
    .groupBy(dayOf(users.createdAt));
  const played = await db
    .select({ day: dayOf(games.startedAt), n: sql<number>`count(*)::int` })
    .from(games)
    .where(and(gte(games.startedAt, since), ne(games.status, 'aborted')))
    .groupBy(dayOf(games.startedAt));
  const s = new Map(signups.map((r) => [r.day, r.n]));
  const g = new Map(played.map((r) => [r.day, r.n]));
  const daily = Array.from({ length: days }, (_, i) => {
    const day = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, signups: s.get(day) ?? 0, games: g.get(day) ?? 0 };
  });
  return {
    users: usersN,
    newUsers24h: new24,
    newUsers7d: new7,
    closedAccounts: closed,
    staff,
    games24h: g24,
    ratedGames24h: rated24,
    gamesTotal: gTotal,
    warnings7d: warn7,
    daily,
  };
}

// ---------------------------------------------------------------- moderation persistence

export async function loadModerationReports(db: Database): Promise<Record<string, unknown>[]> {
  return (await db.select({ data: moderationReports.data }).from(moderationReports)).map((r) => r.data);
}

export async function saveModerationReport(
  db: Database,
  r: { id: string; targetId: string; reporterId: string; status: string; createdAt: number } & Record<string, unknown>,
): Promise<void> {
  const row = { id: r.id, targetId: r.targetId, reporterId: r.reporterId, status: r.status, data: r, createdAt: new Date(r.createdAt) };
  await db.insert(moderationReports).values(row).onConflictDoUpdate({ target: moderationReports.id, set: { status: row.status, data: row.data } });
}

export async function loadChatBans(db: Database): Promise<Record<string, unknown>[]> {
  return (await db.select({ data: chatBans.data }).from(chatBans).where(gte(chatBans.until, new Date()))).map((r) => r.data);
}

export async function saveChatBan(db: Database, b: { playerId: string; until: number } & Record<string, unknown>): Promise<void> {
  const row = { playerId: b.playerId, until: new Date(b.until), data: b };
  await db.insert(chatBans).values(row).onConflictDoUpdate({ target: chatBans.playerId, set: { until: row.until, data: row.data } });
}

export async function deleteChatBan(db: Database, playerId: string): Promise<void> {
  await db.delete(chatBans).where(eq(chatBans.playerId, playerId));
}
