import { and, asc, count, desc, eq, gte, isNotNull, lt, ne, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import {
  appSettings,
  broadcastApplications,
  broadcastEvents,
  broadcastGames,
  broadcastNews,
  broadcastOrganizers,
  broadcastPlayers,
  broadcastRounds,
  streamerApplications,
  streamers,
  users,
  type BroadcastApplicationRow,
  type BroadcastEvalEntry,
  type BroadcastEventRow,
  type BroadcastGameRow,
  type BroadcastNewsRow,
  type BroadcastPlayerRow,
  type BroadcastRoundRow,
  type StreamerApplicationRow,
  type StreamerRow,
} from '../schema';

// ---------------------------------------------------------------------------
// Settings

export async function getAppSetting<T>(db: Database, key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return row?.value as T | undefined;
}

export async function setAppSetting(db: Database, key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Streamers

const userCols = { username: users.username, displayName: users.displayName, title: users.title, country: users.country };
export type StreamerWithUser = StreamerRow & { username: string; displayName: string | null; title: string | null; country: string | null };

export async function getStreamer(db: Database, userId: string): Promise<StreamerWithUser | undefined> {
  const [row] = await db
    .select({ s: streamers, ...userCols })
    .from(streamers)
    .innerJoin(users, eq(users.id, streamers.userId))
    .where(eq(streamers.userId, userId));
  return row ? { ...row.s, username: row.username, displayName: row.displayName, title: row.title, country: row.country } : undefined;
}

export async function listStreamers(db: Database): Promise<StreamerWithUser[]> {
  const rows = await db
    .select({ s: streamers, ...userCols })
    .from(streamers)
    .innerJoin(users, eq(users.id, streamers.userId))
    .orderBy(desc(streamers.liveSince), asc(users.username));
  return rows.map((r) => ({ ...r.s, username: r.username, displayName: r.displayName, title: r.title, country: r.country }));
}

export async function upsertStreamer(db: Database, userId: string, v: { headline: string; channels: { platform: string; url: string }[] }): Promise<void> {
  await db
    .insert(streamers)
    .values({ userId, headline: v.headline, channels: v.channels })
    .onConflictDoUpdate({ target: streamers.userId, set: { headline: v.headline, channels: v.channels } });
}

export interface StreamerLiveUpdate {
  title: string;
  url: string;
  since: Date;
  viewers?: number | null;
  thumbnail?: string | null;
  embed?: string | null;
  /** Found by ChessMate's live check (ends when the stream stops). */
  auto?: boolean;
}

const NOT_LIVE = { liveTitle: null, liveUrl: null, liveSince: null, liveViewers: null, liveThumbnail: null, liveEmbed: null, liveAuto: false };

export async function setStreamerLive(db: Database, userId: string, live: StreamerLiveUpdate | null): Promise<void> {
  await db
    .update(streamers)
    .set(
      live
        ? { liveTitle: live.title, liveUrl: live.url, liveSince: live.since, liveViewers: live.viewers ?? null, liveThumbnail: live.thumbnail ?? null, liveEmbed: live.embed ?? null, liveAuto: live.auto ?? false }
        : NOT_LIVE,
    )
    .where(eq(streamers.userId, userId));
}

/** Switches off streams live since before `before`; returns how many. */
export async function endStaleStreams(db: Database, before: Date): Promise<number> {
  const rows = await db
    .update(streamers)
    .set(NOT_LIVE)
    // Detected streams end when the platform says so; only manual ones time out.
    .where(and(isNotNull(streamers.liveSince), lt(streamers.liveSince, before), eq(streamers.liveAuto, false)))
    .returning({ id: streamers.userId });
  return rows.length;
}

export async function deleteStreamer(db: Database, userId: string): Promise<boolean> {
  const rows = await db.delete(streamers).where(eq(streamers.userId, userId)).returning({ id: streamers.userId });
  return rows.length > 0;
}

export type StreamerApplicationWithUser = StreamerApplicationRow & { username: string; displayName: string | null };

const withUser = <T extends { userId: string }>(rows: { a: T; username: string; displayName: string | null }[]) =>
  rows.map((r) => ({ ...r.a, username: r.username, displayName: r.displayName }));

export async function insertStreamerApplication(db: Database, v: { userId: string; channels: { platform: string; url: string }[]; about: string }): Promise<StreamerApplicationRow> {
  const [row] = await db.insert(streamerApplications).values(v).returning();
  return row!;
}

export async function latestStreamerApplication(db: Database, userId: string): Promise<StreamerApplicationWithUser | undefined> {
  const rows = await db
    .select({ a: streamerApplications, username: users.username, displayName: users.displayName })
    .from(streamerApplications)
    .innerJoin(users, eq(users.id, streamerApplications.userId))
    .where(eq(streamerApplications.userId, userId))
    .orderBy(desc(streamerApplications.createdAt))
    .limit(1);
  return withUser(rows)[0];
}

export async function getStreamerApplication(db: Database, id: string): Promise<StreamerApplicationWithUser | undefined> {
  const rows = await db
    .select({ a: streamerApplications, username: users.username, displayName: users.displayName })
    .from(streamerApplications)
    .innerJoin(users, eq(users.id, streamerApplications.userId))
    .where(eq(streamerApplications.id, id));
  return withUser(rows)[0];
}

export async function listStreamerApplications(db: Database, status?: string): Promise<StreamerApplicationWithUser[]> {
  const rows = await db
    .select({ a: streamerApplications, username: users.username, displayName: users.displayName })
    .from(streamerApplications)
    .innerJoin(users, eq(users.id, streamerApplications.userId))
    .where(status ? eq(streamerApplications.status, status) : undefined)
    .orderBy(desc(streamerApplications.createdAt))
    .limit(200);
  return withUser(rows);
}

export async function reviewStreamerApplication(db: Database, id: string, v: { status: 'approved' | 'rejected'; note: string | null; reviewedBy: string }): Promise<void> {
  await db.update(streamerApplications).set({ ...v, reviewedAt: new Date() }).where(eq(streamerApplications.id, id));
}

export async function countStreamerApplicationsSince(db: Database, userId: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(streamerApplications)
    .where(and(eq(streamerApplications.userId, userId), gte(streamerApplications.createdAt, since)));
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Events

export type NewEvent = typeof broadcastEvents.$inferInsert;

export async function insertEvent(db: Database, v: NewEvent): Promise<BroadcastEventRow> {
  const [row] = await db.insert(broadcastEvents).values(v).returning();
  return row!;
}

export async function updateEvent(db: Database, id: string, patch: Partial<NewEvent>): Promise<BroadcastEventRow | undefined> {
  const [row] = await db
    .update(broadcastEvents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(broadcastEvents.id, id))
    .returning();
  return row;
}

export async function deleteEvent(db: Database, id: string): Promise<boolean> {
  const rows = await db.delete(broadcastEvents).where(eq(broadcastEvents.id, id)).returning({ id: broadcastEvents.id });
  return rows.length > 0;
}

/** Event rows without the logo (lists). */
const eventCols = {
  id: broadcastEvents.id,
  name: broadcastEvents.name,
  shortDescription: broadcastEvents.shortDescription,
  description: broadcastEvents.description,
  location: broadcastEvents.location,
  startsAt: broadcastEvents.startsAt,
  endsAt: broadcastEvents.endsAt,
  format: broadcastEvents.format,
  timeControl: broadcastEvents.timeControl,
  website: broadcastEvents.website,
  hasLogo: sql<boolean>`${broadcastEvents.logo} is not null`,
  hasCover: sql<boolean>`${broadcastEvents.cover} is not null`,
  links: broadcastEvents.links,
  /** Imported events keep the source's image link instead of an uploaded logo. */
  logoUrl: sql<string | null>`case when ${broadcastEvents.logo} like 'https://%' then ${broadcastEvents.logo} else null end`,
  published: broadcastEvents.published,
  featured: broadcastEvents.featured,
  hidden: broadcastEvents.hidden,
  source: broadcastEvents.source,
  externalId: broadcastEvents.externalId,
  sourceUrl: broadcastEvents.sourceUrl,
  createdBy: broadcastEvents.createdBy,
  createdAt: broadcastEvents.createdAt,
  updatedAt: broadcastEvents.updatedAt,
};
export type EventListRow = Omit<BroadcastEventRow, 'logo' | 'cover'> & { hasLogo: boolean; hasCover: boolean; logoUrl: string | null };

export async function getEvent(db: Database, id: string): Promise<EventListRow | undefined> {
  const [row] = await db.select(eventCols).from(broadcastEvents).where(eq(broadcastEvents.id, id));
  return row;
}

export async function listEvents(db: Database, opts: { endedAfter?: Date } = {}): Promise<EventListRow[]> {
  return db
    .select(eventCols)
    .from(broadcastEvents)
    .where(opts.endedAfter ? gte(broadcastEvents.endsAt, opts.endedAfter) : undefined)
    .orderBy(desc(broadcastEvents.startsAt))
    .limit(500);
}

export async function findEventByExternal(db: Database, source: string, externalId: string): Promise<EventListRow | undefined> {
  const [row] = await db
    .select(eventCols)
    .from(broadcastEvents)
    .where(and(eq(broadcastEvents.source, source), eq(broadcastEvents.externalId, externalId)));
  return row;
}

export async function getEventCover(db: Database, id: string): Promise<{ cover: string | null; updatedAt: Date } | undefined> {
  const [row] = await db.select({ cover: broadcastEvents.cover, updatedAt: broadcastEvents.updatedAt }).from(broadcastEvents).where(eq(broadcastEvents.id, id));
  return row;
}

export async function getEventLogo(db: Database, id: string): Promise<{ logo: string | null; updatedAt: Date } | undefined> {
  const [row] = await db.select({ logo: broadcastEvents.logo, updatedAt: broadcastEvents.updatedAt }).from(broadcastEvents).where(eq(broadcastEvents.id, id));
  return row;
}

// Organisers

export async function listOrganizers(db: Database, eventId: string): Promise<{ userId: string; username: string; displayName: string | null }[]> {
  return db
    .select({ userId: broadcastOrganizers.userId, username: users.username, displayName: users.displayName })
    .from(broadcastOrganizers)
    .innerJoin(users, eq(users.id, broadcastOrganizers.userId))
    .where(eq(broadcastOrganizers.eventId, eventId))
    .orderBy(asc(broadcastOrganizers.createdAt));
}

export async function listAllOrganizers(db: Database): Promise<{ eventId: string; userId: string }[]> {
  return db.select({ eventId: broadcastOrganizers.eventId, userId: broadcastOrganizers.userId }).from(broadcastOrganizers);
}

export async function addOrganizer(db: Database, eventId: string, userId: string, addedBy: string): Promise<void> {
  await db.insert(broadcastOrganizers).values({ eventId, userId, addedBy }).onConflictDoNothing();
}

export async function removeOrganizer(db: Database, eventId: string, userId: string): Promise<void> {
  await db.delete(broadcastOrganizers).where(and(eq(broadcastOrganizers.eventId, eventId), eq(broadcastOrganizers.userId, userId)));
}

// Players

export type PlayerWithUser = BroadcastPlayerRow & { username: string | null };

export async function listPlayers(db: Database, eventId: string): Promise<PlayerWithUser[]> {
  const rows = await db
    .select({ p: broadcastPlayers, username: users.username })
    .from(broadcastPlayers)
    .leftJoin(users, eq(users.id, broadcastPlayers.userId))
    .where(eq(broadcastPlayers.eventId, eventId))
    .orderBy(desc(broadcastPlayers.rating), asc(broadcastPlayers.name));
  return rows.map((r) => ({ ...r.p, username: r.username }));
}

export type NewPlayer = typeof broadcastPlayers.$inferInsert;

export async function getPlayer(db: Database, id: string): Promise<BroadcastPlayerRow | undefined> {
  const [row] = await db.select().from(broadcastPlayers).where(eq(broadcastPlayers.id, id));
  return row;
}

export async function insertPlayers(db: Database, rows: NewPlayer[]): Promise<BroadcastPlayerRow[]> {
  if (!rows.length) return [];
  return db.insert(broadcastPlayers).values(rows).returning();
}

export async function updatePlayer(db: Database, id: string, patch: Partial<NewPlayer>): Promise<BroadcastPlayerRow | undefined> {
  const [row] = await db.update(broadcastPlayers).set(patch).where(eq(broadcastPlayers.id, id)).returning();
  return row;
}

export async function deletePlayer(db: Database, id: string): Promise<void> {
  await db.delete(broadcastPlayers).where(eq(broadcastPlayers.id, id));
}

// Rounds

export type NewRound = typeof broadcastRounds.$inferInsert;

export async function listRounds(db: Database, eventId: string): Promise<BroadcastRoundRow[]> {
  return db.select().from(broadcastRounds).where(eq(broadcastRounds.eventId, eventId)).orderBy(asc(broadcastRounds.number), asc(broadcastRounds.createdAt));
}

/** Rounds fed from a PGN link or Lichess that may still change. */
export async function listSyncedRounds(db: Database): Promise<BroadcastRoundRow[]> {
  return db
    .select()
    .from(broadcastRounds)
    .where(and(ne(broadcastRounds.sourceKind, 'manual'), eq(broadcastRounds.sourceFinished, false)));
}

export async function getRound(db: Database, id: string): Promise<BroadcastRoundRow | undefined> {
  const [row] = await db.select().from(broadcastRounds).where(eq(broadcastRounds.id, id));
  return row;
}

export async function insertRound(db: Database, v: NewRound): Promise<BroadcastRoundRow> {
  const [row] = await db.insert(broadcastRounds).values(v).returning();
  return row!;
}

export async function updateRound(db: Database, id: string, patch: Partial<NewRound>): Promise<BroadcastRoundRow | undefined> {
  const [row] = await db.update(broadcastRounds).set(patch).where(eq(broadcastRounds.id, id)).returning();
  return row;
}

export async function deleteRound(db: Database, id: string): Promise<void> {
  await db.delete(broadcastRounds).where(eq(broadcastRounds.id, id));
}

// Games

export type NewBroadcastGame = typeof broadcastGames.$inferInsert;
/** Game rows without moves and clocks (lists). */
export type GameSummaryRow = Omit<BroadcastGameRow, 'moves' | 'clocks' | 'evals' | 'grades'>;

const gameSummaryCols = {
  id: broadcastGames.id,
  roundId: broadcastGames.roundId,
  eventId: broadcastGames.eventId,
  board: broadcastGames.board,
  whiteName: broadcastGames.whiteName,
  blackName: broadcastGames.blackName,
  whiteTitle: broadcastGames.whiteTitle,
  blackTitle: broadcastGames.blackTitle,
  whiteRating: broadcastGames.whiteRating,
  blackRating: broadcastGames.blackRating,
  whiteFed: broadcastGames.whiteFed,
  blackFed: broadcastGames.blackFed,
  whitePlayerId: broadcastGames.whitePlayerId,
  blackPlayerId: broadcastGames.blackPlayerId,
  result: broadcastGames.result,
  initialFen: broadcastGames.initialFen,
  fen: broadcastGames.fen,
  ply: broadcastGames.ply,
  lastMove: broadcastGames.lastMove,
  whiteClockMs: broadcastGames.whiteClockMs,
  blackClockMs: broadcastGames.blackClockMs,
  clockAt: broadcastGames.clockAt,
  evalScore: broadcastGames.evalScore,
  lastGrade: broadcastGames.lastGrade,
  updatedAt: broadcastGames.updatedAt,
};

export async function listGameSummaries(db: Database, eventId: string): Promise<GameSummaryRow[]> {
  return db.select(gameSummaryCols).from(broadcastGames).where(eq(broadcastGames.eventId, eventId)).orderBy(asc(broadcastGames.board));
}

export async function getBroadcastGame(db: Database, id: string): Promise<BroadcastGameRow | undefined> {
  const [row] = await db.select().from(broadcastGames).where(eq(broadcastGames.id, id));
  return row;
}

/** Inserts or updates games by board in one round; returns the ids of the rows written. */
export async function upsertGames(db: Database, rows: NewBroadcastGame[]): Promise<string[]> {
  if (!rows.length) return [];
  const set = {
    whiteName: sql`excluded.white_name`,
    blackName: sql`excluded.black_name`,
    whiteTitle: sql`excluded.white_title`,
    blackTitle: sql`excluded.black_title`,
    whiteRating: sql`excluded.white_rating`,
    blackRating: sql`excluded.black_rating`,
    whiteFed: sql`excluded.white_fed`,
    blackFed: sql`excluded.black_fed`,
    whitePlayerId: sql`excluded.white_player_id`,
    blackPlayerId: sql`excluded.black_player_id`,
    result: sql`excluded.result`,
    initialFen: sql`excluded.initial_fen`,
    moves: sql`excluded.moves`,
    clocks: sql`excluded.clocks`,
    fen: sql`excluded.fen`,
    ply: sql`excluded.ply`,
    lastMove: sql`excluded.last_move`,
    whiteClockMs: sql`excluded.white_clock_ms`,
    blackClockMs: sql`excluded.black_clock_ms`,
    clockAt: sql`excluded.clock_at`,
    updatedAt: sql`excluded.updated_at`,
  };
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const r = await db
      .insert(broadcastGames)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({ target: [broadcastGames.roundId, broadcastGames.board], set })
      .returning({ id: broadcastGames.id });
    ids.push(...r.map((x) => x.id));
  }
  return ids;
}

/** Saves live engine analysis of a game. */
export async function saveGameAnalysis(
  db: Database,
  id: string,
  v: { evals: (BroadcastEvalEntry | null)[]; grades: (string | null)[]; evalScore: { cp?: number; mate?: number } | null; lastGrade: string | null },
): Promise<void> {
  await db.update(broadcastGames).set(v).where(eq(broadcastGames.id, id));
}

/** Recently active games whose analysis is behind their moves. */
export async function gamesNeedingAnalysis(db: Database, since: Date, limit = 50): Promise<string[]> {
  const rows = await db
    .select({ id: broadcastGames.id })
    .from(broadcastGames)
    .where(and(gte(broadcastGames.updatedAt, since), sql`(jsonb_array_length(${broadcastGames.evals}) < ${broadcastGames.ply} + 1 or jsonb_array_length(${broadcastGames.grades}) < ${broadcastGames.ply})`))
    .orderBy(desc(broadcastGames.updatedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Removes games of a round whose boards are not in `keep` (they left the source file). */
export async function deleteGamesExcept(db: Database, roundId: string, keep: number[]): Promise<void> {
  await db.delete(broadcastGames).where(and(eq(broadcastGames.roundId, roundId), keep.length ? notInArray(broadcastGames.board, keep) : undefined));
}

/** Sets the players' federations of a game (for flags), leaving everything else as it is. */
export async function updateGameFeds(db: Database, id: string, v: { whiteFed: string | null; blackFed: string | null }): Promise<void> {
  await db.update(broadcastGames).set(v).where(eq(broadcastGames.id, id));
}

export async function updateGame(db: Database, id: string, patch: Partial<NewBroadcastGame>): Promise<BroadcastGameRow | undefined> {
  const [row] = await db.update(broadcastGames).set({ ...patch, updatedAt: new Date() }).where(eq(broadcastGames.id, id)).returning();
  return row;
}

export async function deleteGame(db: Database, id: string): Promise<void> {
  await db.delete(broadcastGames).where(eq(broadcastGames.id, id));
}

// News

export type NewsWithAuthor = Omit<BroadcastNewsRow, 'image'> & { hasImage: boolean; username: string | null; displayName: string | null };

const newsCols = {
  id: broadcastNews.id,
  eventId: broadcastNews.eventId,
  authorId: broadcastNews.authorId,
  title: broadcastNews.title,
  body: broadcastNews.body,
  links: broadcastNews.links,
  createdAt: broadcastNews.createdAt,
  hasImage: sql<boolean>`${broadcastNews.image} is not null`,
};

export async function listEventNews(db: Database, eventId: string): Promise<NewsWithAuthor[]> {
  const rows = await db
    .select({ n: newsCols, username: users.username, displayName: users.displayName })
    .from(broadcastNews)
    .leftJoin(users, eq(users.id, broadcastNews.authorId))
    .where(eq(broadcastNews.eventId, eventId))
    .orderBy(desc(broadcastNews.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r.n, username: r.username, displayName: r.displayName }));
}

export async function getEventNewsImage(db: Database, id: string): Promise<string | null> {
  const [row] = await db.select({ image: broadcastNews.image }).from(broadcastNews).where(eq(broadcastNews.id, id));
  return row?.image ?? null;
}

export async function insertEventNews(
  db: Database,
  v: { eventId: string; authorId: string; title: string; body: string; image?: string | null; links?: { label: string; url: string }[] },
): Promise<BroadcastNewsRow> {
  const [row] = await db.insert(broadcastNews).values(v).returning();
  return row!;
}

export async function getEventNews(db: Database, id: string): Promise<BroadcastNewsRow | undefined> {
  const [row] = await db.select().from(broadcastNews).where(eq(broadcastNews.id, id));
  return row;
}

export async function deleteEventNews(db: Database, id: string): Promise<void> {
  await db.delete(broadcastNews).where(eq(broadcastNews.id, id));
}

// Applications to broadcast

export type EventApplicationWithUser = BroadcastApplicationRow & { username: string; displayName: string | null };

export async function insertEventApplication(db: Database, v: typeof broadcastApplications.$inferInsert): Promise<BroadcastApplicationRow> {
  const [row] = await db.insert(broadcastApplications).values(v).returning();
  return row!;
}

export async function listEventApplications(db: Database, opts: { status?: string; userId?: string } = {}): Promise<EventApplicationWithUser[]> {
  const conds = [opts.status ? eq(broadcastApplications.status, opts.status) : undefined, opts.userId ? eq(broadcastApplications.userId, opts.userId) : undefined].filter(Boolean);
  const rows = await db
    .select({ a: broadcastApplications, username: users.username, displayName: users.displayName })
    .from(broadcastApplications)
    .innerJoin(users, eq(users.id, broadcastApplications.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(broadcastApplications.createdAt))
    .limit(200);
  return withUser(rows);
}

export async function getEventApplication(db: Database, id: string): Promise<EventApplicationWithUser | undefined> {
  const rows = await db
    .select({ a: broadcastApplications, username: users.username, displayName: users.displayName })
    .from(broadcastApplications)
    .innerJoin(users, eq(users.id, broadcastApplications.userId))
    .where(eq(broadcastApplications.id, id));
  return withUser(rows)[0];
}

export async function reviewEventApplication(db: Database, id: string, v: { status: 'approved' | 'rejected'; note: string | null; reviewedBy: string; eventId?: string | null }): Promise<void> {
  await db.update(broadcastApplications).set({ ...v, reviewedAt: new Date() }).where(eq(broadcastApplications.id, id));
}

export async function countEventApplicationsSince(db: Database, userId: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(broadcastApplications)
    .where(and(eq(broadcastApplications.userId, userId), gte(broadcastApplications.createdAt, since)));
  return r?.n ?? 0;
}

