import type { Color, GameOutcome, TimeControl } from '@chessmate/core';
import { timeCategory } from '@chessmate/core';
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { Database } from '../client';
import { games, moves, users, type GameRow, type MoveRow } from '../schema';

export interface GameStart {
  id: string;
  white: { id: string; name: string; rating?: number };
  black: { id: string; name: string; rating?: number };
  timeControl: TimeControl;
  rated: boolean;
  initialFen: string;
  startedAt?: Date;
}

/**
 * Inserts a new game. Player ids that are not registered users (guests) are
 * stored as null; their names are kept.
 */
export async function createGame(db: Database, g: GameStart): Promise<void> {
  const ids = [g.white.id, g.black.id];
  const known = new Set((await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))).map((r) => r.id));
  await db.insert(games).values({
    id: g.id,
    whiteUserId: known.has(g.white.id) ? g.white.id : null,
    blackUserId: known.has(g.black.id) ? g.black.id : null,
    whiteName: g.white.name,
    blackName: g.black.name,
    initialMs: g.timeControl.initialMs,
    incrementMs: g.timeControl.incrementMs,
    timeCategory: timeCategory(g.timeControl),
    rated: g.rated,
    initialFen: g.initialFen,
    whiteRatingBefore: g.white.rating,
    blackRatingBefore: g.black.rating,
    startedAt: g.startedAt ?? new Date(),
  });
}

export interface MoveRecord {
  ply: number;
  uci: string;
  san: string;
  fenAfter: string;
  whiteMs?: number;
  blackMs?: number;
  spentMs?: number;
}

export async function addMove(db: Database, gameId: string, m: MoveRecord): Promise<void> {
  await db.insert(moves).values({ gameId, ...m }).onConflictDoNothing();
}

export interface GameEnd {
  outcome: GameOutcome;
  pgn: string;
  finalFen: string;
  plyCount: number;
  ratingsAfter?: Partial<Record<Color, number>>;
  ratingsBefore?: Partial<Record<Color, number>>;
  /** Opening from the book, when recognised. */
  opening?: { eco: string; name: string } | null;
  endedAt?: Date;
}

export async function finishGame(db: Database, id: string, e: GameEnd): Promise<void> {
  await db
    .update(games)
    .set({
      status: e.outcome.reason === 'aborted' ? 'aborted' : 'finished',
      result: e.outcome.result,
      winner: e.outcome.winner,
      endReason: e.outcome.reason,
      pgn: e.pgn,
      finalFen: e.finalFen,
      plyCount: e.plyCount,
      ...(e.ratingsBefore?.w !== undefined ? { whiteRatingBefore: e.ratingsBefore.w } : {}),
      ...(e.ratingsBefore?.b !== undefined ? { blackRatingBefore: e.ratingsBefore.b } : {}),
      whiteRatingAfter: e.ratingsAfter?.w,
      blackRatingAfter: e.ratingsAfter?.b,
      ...(e.opening ? { eco: e.opening.eco, openingName: e.opening.name } : {}),
      endedAt: e.endedAt ?? new Date(),
    })
    .where(eq(games.id, id));
}

export async function getGame(db: Database, id: string): Promise<(GameRow & { moves: MoveRow[] }) | undefined> {
  const [g] = await db.select().from(games).where(eq(games.id, id));
  if (!g) return undefined;
  const ms = await db.select().from(moves).where(eq(moves.gameId, id)).orderBy(moves.ply);
  return { ...g, moves: ms };
}

/** A user's games, newest first. Pass the last row's startedAt as `before` to page. */
export async function listUserGames(
  db: Database,
  userId: string,
  opts: { limit?: number; before?: Date; includeActive?: boolean } = {},
): Promise<GameRow[]> {
  const conds = [or(eq(games.whiteUserId, userId), eq(games.blackUserId, userId))];
  if (!opts.includeActive) conds.push(eq(games.status, 'finished'));
  if (opts.before) conds.push(lt(games.startedAt, opts.before));
  return db
    .select()
    .from(games)
    .where(and(...conds))
    .orderBy(desc(games.startedAt))
    .limit(Math.min(opts.limit ?? 20, 100));
}

export interface HeadToHead {
  games: number;
  /** From `userId`'s side. */
  wins: number;
  draws: number;
  losses: number;
  lastPlayedAt: number | null;
  /** Newest finished games between the two, at most 5. */
  recent: { id: string; color: Color; result: '1-0' | '0-1' | '1/2-1/2'; endedAt: number | null }[];
}

/** Finished games between two users, counted from `userId`'s side. */
export async function headToHead(db: Database, userId: string, otherId: string): Promise<HeadToHead> {
  const rows = await db
    .select({ id: games.id, whiteUserId: games.whiteUserId, result: games.result, endedAt: games.endedAt, startedAt: games.startedAt })
    .from(games)
    .where(
      and(
        eq(games.status, 'finished'),
        or(and(eq(games.whiteUserId, userId), eq(games.blackUserId, otherId)), and(eq(games.whiteUserId, otherId), eq(games.blackUserId, userId))),
      ),
    )
    .orderBy(desc(games.startedAt))
    .limit(1000);
  const out: HeadToHead = { games: 0, wins: 0, draws: 0, losses: 0, lastPlayedAt: null, recent: [] };
  for (const r of rows) {
    if (r.result === '*') continue;
    const color: Color = r.whiteUserId === userId ? 'w' : 'b';
    out.games++;
    if (r.result === '1/2-1/2') out.draws++;
    else if ((r.result === '1-0') === (color === 'w')) out.wins++;
    else out.losses++;
    const at = (r.endedAt ?? r.startedAt)?.getTime() ?? null;
    out.lastPlayedAt ??= at;
    if (out.recent.length < 5) out.recent.push({ id: r.id, color, result: r.result, endedAt: at });
  }
  return out;
}

/**
 * Marks games left "active" by a crashed or restarted server as aborted.
 * Call once at startup, before accepting connections.
 */
export async function abortStaleGames(db: Database): Promise<number> {
  const rows = await db
    .update(games)
    .set({ status: 'aborted', endReason: 'aborted', endedAt: new Date() })
    .where(eq(games.status, 'active'))
    .returning({ id: games.id });
  return rows.length;
}
