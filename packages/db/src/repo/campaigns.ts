import { and, desc, eq, gt, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import { games, pushCampaignDeliveries, pushCampaigns, pushTokens, pushTriggerJobs, users, type PushCampaignRow, type PushTriggerJobRow } from '../schema';

/**
 * Push campaigns from the admin console: the campaigns themselves, who they
 * reached (for caps and cooldowns), pending trigger sends, and the audience
 * query that turns console filters into a list of players.
 */

export type NewPushCampaignRow = typeof pushCampaigns.$inferInsert;

/** Same shape as CampaignAudience in @chessmate/core; repeated here so the db package stays independent of it. */
export interface AudienceFilter {
  usernames: string[];
  platform: 'any' | 'ios' | 'android' | 'web';
  inactiveDays: number | null;
  activeWithinDays: number | null;
  joinedWithinDays: number | null;
  minGames: number | null;
  maxGames: number | null;
  countries: string[];
}

export interface AudienceMember {
  id: string;
  username: string;
}

const DAY = 86_400_000;

export async function listPushCampaigns(db: Database): Promise<PushCampaignRow[]> {
  return db.select().from(pushCampaigns).orderBy(desc(pushCampaigns.createdAt));
}

export async function insertPushCampaign(db: Database, row: NewPushCampaignRow): Promise<PushCampaignRow> {
  const [r] = await db.insert(pushCampaigns).values(row).returning();
  return r!;
}

export async function updatePushCampaign(db: Database, id: string, patch: Partial<NewPushCampaignRow>): Promise<PushCampaignRow | null> {
  const [r] = await db
    .update(pushCampaigns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pushCampaigns.id, id))
    .returning();
  return r ?? null;
}

export async function deletePushCampaign(db: Database, id: string): Promise<void> {
  await db.delete(pushCampaigns).where(eq(pushCampaigns.id, id));
}

/** Open accounts that match every filter that is set. */
function audienceWhere(a: AudienceFilter, now: number): SQL {
  const conds: SQL[] = [isNull(users.deletedAt), isNull(users.closedAt)];
  if (a.usernames.length) {
    conds.push(inArray(sql`lower(${users.username})`, a.usernames.map((u) => u.toLowerCase())));
    return and(...conds)!;
  }
  if (a.platform === 'ios' || a.platform === 'android') {
    conds.push(sql`exists (select 1 from ${pushTokens} where ${pushTokens.userId} = ${users.id} and ${pushTokens.platform} = ${a.platform})`);
  } else if (a.platform === 'web') {
    conds.push(sql`not exists (select 1 from ${pushTokens} where ${pushTokens.userId} = ${users.id})`);
  }
  // Players never seen since last-seen tracking started count as inactive since they signed up.
  const lastSeen = sql`coalesce(${users.lastSeenAt}, ${users.createdAt})`;
  if (a.inactiveDays) conds.push(sql`${lastSeen} <= ${new Date(now - a.inactiveDays * DAY)}`);
  if (a.activeWithinDays) conds.push(sql`${lastSeen} > ${new Date(now - a.activeWithinDays * DAY)}`);
  if (a.joinedWithinDays) conds.push(gt(users.createdAt, new Date(now - a.joinedWithinDays * DAY)));
  if (a.countries.length) conds.push(inArray(users.country, a.countries));
  if (a.minGames !== null || a.maxGames !== null) {
    const played = sql`(select count(*) from ${games} where (${games.whiteUserId} = ${users.id} or ${games.blackUserId} = ${users.id}) and ${games.status} = 'finished')`;
    if (a.minGames !== null) conds.push(sql`${played} >= ${a.minGames}`);
    if (a.maxGames !== null) conds.push(sql`${played} <= ${a.maxGames}`);
  }
  return and(...conds)!;
}

export async function resolveAudience(db: Database, a: AudienceFilter, now: number, opts: { limit?: number; afterId?: string } = {}): Promise<AudienceMember[]> {
  const where = opts.afterId ? and(audienceWhere(a, now), gt(users.id, opts.afterId)) : audienceWhere(a, now);
  return db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(where)
    .orderBy(users.id)
    .limit(opts.limit ?? 1000);
}

export async function countAudience(db: Database, a: AudienceFilter, now: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(audienceWhere(a, now));
  return Number(r?.n ?? 0);
}

/** Of `userIds`, the open accounts that match the audience, with their usernames (used before a trigger sends). */
export async function filterAudience(db: Database, a: AudienceFilter, userIds: string[], now: number): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(audienceWhere(a, now), inArray(users.id, userIds)));
  return new Map(rows.map((r) => [r.id, r.username]));
}

export async function recordCampaignDeliveries(db: Database, campaignId: string, userIds: string[], at: Date): Promise<void> {
  if (!userIds.length) return;
  await db.insert(pushCampaignDeliveries).values(userIds.map((userId) => ({ campaignId, userId, createdAt: at })));
}

/** Campaign notifications each player got since `since` (all campaigns), for the daily cap. */
export async function recentDeliveryCounts(db: Database, userIds: string[], since: Date): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ userId: pushCampaignDeliveries.userId, n: sql<number>`count(*)::int` })
    .from(pushCampaignDeliveries)
    .where(and(inArray(pushCampaignDeliveries.userId, userIds), gt(pushCampaignDeliveries.createdAt, since)))
    .groupBy(pushCampaignDeliveries.userId);
  return new Map(rows.map((r) => [r.userId, Number(r.n)]));
}

/** How many times, and when last, one campaign reached each player (trigger cooldown and per-player limit). */
export async function campaignDeliveryHistory(db: Database, campaignId: string, userIds: string[]): Promise<Map<string, { count: number; last: number }>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ userId: pushCampaignDeliveries.userId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${pushCampaignDeliveries.createdAt})` })
    .from(pushCampaignDeliveries)
    .where(and(eq(pushCampaignDeliveries.campaignId, campaignId), inArray(pushCampaignDeliveries.userId, userIds)))
    .groupBy(pushCampaignDeliveries.userId);
  return new Map(rows.map((r) => [r.userId, { count: Number(r.n), last: new Date(r.last).getTime() }]));
}

/** Queues (or moves) a trigger send for one player; one pending send per player per trigger. */
export async function upsertTriggerJob(db: Database, campaignId: string, userId: string, dueAt: Date): Promise<void> {
  await db
    .insert(pushTriggerJobs)
    .values({ campaignId, userId, dueAt })
    .onConflictDoUpdate({ target: [pushTriggerJobs.campaignId, pushTriggerJobs.userId], set: { dueAt, createdAt: new Date() } });
}

/** Drops a player's pending sends for these triggers (they came back, or played). */
export async function deleteTriggerJobs(db: Database, userId: string, campaignIds: string[]): Promise<void> {
  if (!campaignIds.length) return;
  await db.delete(pushTriggerJobs).where(and(eq(pushTriggerJobs.userId, userId), inArray(pushTriggerJobs.campaignId, campaignIds)));
}

/** Removes and returns the sends that are due. */
export async function takeDueTriggerJobs(db: Database, now: Date, limit = 500): Promise<PushTriggerJobRow[]> {
  const due = db.select({ c: pushTriggerJobs.campaignId, u: pushTriggerJobs.userId }).from(pushTriggerJobs).where(lte(pushTriggerJobs.dueAt, now)).limit(limit);
  return db
    .delete(pushTriggerJobs)
    .where(sql`(${pushTriggerJobs.campaignId}, ${pushTriggerJobs.userId}) in (${due})`)
    .returning();
}

export async function countTriggerJobs(db: Database, campaignId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pushTriggerJobs).where(eq(pushTriggerJobs.campaignId, campaignId));
  return Number(r?.n ?? 0);
}

/**
 * Players away for `days` days (but not more than a week longer, so turning a
 * trigger on does not reach every long-gone account) who have not had this
 * campaign since they were last seen.
 */
export async function inactiveTriggerCandidates(db: Database, campaignId: string, days: number, now: number, limit = 500): Promise<string[]> {
  const lastSeen = sql`coalesce(${users.lastSeenAt}, ${users.createdAt})`;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        isNull(users.closedAt),
        sql`${lastSeen} <= ${new Date(now - days * DAY)}`,
        sql`${lastSeen} > ${new Date(now - (days + 7) * DAY)}`,
        sql`not exists (select 1 from ${pushCampaignDeliveries} where ${pushCampaignDeliveries.campaignId} = ${campaignId} and ${pushCampaignDeliveries.userId} = ${users.id} and ${pushCampaignDeliveries.createdAt} > ${lastSeen})`,
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Records that the player has the app open. */
export async function touchLastSeen(db: Database, userId: string, at: Date): Promise<void> {
  await db.update(users).set({ lastSeenAt: at }).where(eq(users.id, userId));
}

/** Online games the player started after `since`. */
export async function countGamesSince(db: Database, userId: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(games)
    .where(and(sql`(${games.whiteUserId} = ${userId} or ${games.blackUserId} = ${userId})`, gt(games.startedAt, since)));
  return Number(r?.n ?? 0);
}

/** Devices with push on, by platform, and how many players have one. */
export async function pushTokenStats(db: Database): Promise<{ devices: Record<string, number>; players: number }> {
  const rows = await db.select({ platform: pushTokens.platform, n: sql<number>`count(*)::int` }).from(pushTokens).groupBy(pushTokens.platform);
  const [p] = await db.select({ n: sql<number>`count(distinct ${pushTokens.userId})::int` }).from(pushTokens);
  return { devices: Object.fromEntries(rows.map((r) => [r.platform, Number(r.n)])), players: Number(p?.n ?? 0) };
}

/** Accounts created between `from` and `to` that have never started an online game and have not had this campaign. */
export async function newPlayerTriggerCandidates(db: Database, campaignId: string, from: Date, to: Date, limit = 500): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        isNull(users.closedAt),
        gt(users.createdAt, from),
        lte(users.createdAt, to),
        sql`not exists (select 1 from ${games} where ${games.whiteUserId} = ${users.id} or ${games.blackUserId} = ${users.id})`,
        sql`not exists (select 1 from ${pushCampaignDeliveries} where ${pushCampaignDeliveries.campaignId} = ${campaignId} and ${pushCampaignDeliveries.userId} = ${users.id})`,
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}
