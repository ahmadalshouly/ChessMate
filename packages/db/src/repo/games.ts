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
