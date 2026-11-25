import { and, asc, count, desc, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm';

import type { Database } from '../client';
import { explorerCache, explorerMoves, games, moves, type ExplorerMoveRow } from '../schema';

/** One move of one finished game, for the ChessMate explorer counts. */
export interface ExplorerTallyRow {
  position: string;
  uci: string;
  san: string;
}

/**
 * Adds one finished game to the explorer counts: every tallied move gets the
 * game's result, and its players' average rating when both are known. One
 * statement per game.
 */
export async function addExplorerGame(
  db: Database,
  tallies: ExplorerTallyRow[],
  result: { winner: 'w' | 'b' | null; averageRating: number | null },
): Promise<void> {
  if (!tallies.length) return;
  // A game can reach the same position with the same move twice (a repetition): count it once.
  const seen = new Set<string>();
  const unique = tallies.filter((t) => {
    const k = `${t.position} ${t.uci}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const rating = result.averageRating !== null && Number.isFinite(result.averageRating) ? Math.round(result.averageRating) : null;
  const rows = unique.map((t) => ({
    position: t.position,
    uci: t.uci,
    san: t.san,
    white: result.winner === 'w' ? 1 : 0,
    draws: result.winner === null ? 1 : 0,
    black: result.winner === 'b' ? 1 : 0,
    ratingSum: rating ?? 0,
    ratedGames: rating === null ? 0 : 1,
  }));
  await db
    .insert(explorerMoves)
    .values(rows)
    .onConflictDoUpdate({
      target: [explorerMoves.position, explorerMoves.uci],
      set: {
        white: sql`${explorerMoves.white} + excluded.white`,
        draws: sql`${explorerMoves.draws} + excluded.draws`,
        black: sql`${explorerMoves.black} + excluded.black`,
        ratingSum: sql`${explorerMoves.ratingSum} + excluded.rating_sum`,
        ratedGames: sql`${explorerMoves.ratedGames} + excluded.rated_games`,
      },
    });
}

/** The counted moves from a position, most played first. */
export async function explorerMovesAt(db: Database, position: string, limit = 16): Promise<ExplorerMoveRow[]> {
  return db
    .select()
    .from(explorerMoves)
    .where(eq(explorerMoves.position, position))
    .orderBy(desc(sql`${explorerMoves.white} + ${explorerMoves.draws} + ${explorerMoves.black}`), asc(explorerMoves.uci))
    .limit(limit);
}

/** Total games over all moves from a position (the listed moves may be only the top few). */
export async function explorerTotalsAt(db: Database, position: string): Promise<{ white: number; draws: number; black: number }> {
  const [row] = await db
    .select({
      white: sql<number>`coalesce(sum(${explorerMoves.white}), 0)::int`,
      draws: sql<number>`coalesce(sum(${explorerMoves.draws}), 0)::int`,
      black: sql<number>`coalesce(sum(${explorerMoves.black}), 0)::int`,
    })
    .from(explorerMoves)
    .where(eq(explorerMoves.position, position));
  return { white: Number(row?.white ?? 0), draws: Number(row?.draws ?? 0), black: Number(row?.black ?? 0) };
}

/** A cached Lichess explorer answer, if one was stored at or after `freshAfter` (any age when absent). */
export async function cachedExplorer(db: Database, key: string, freshAfter?: Date): Promise<{ body: unknown; fetchedAt: Date } | null> {
  const where = freshAfter ? and(eq(explorerCache.key, key), gt(explorerCache.fetchedAt, freshAfter)) : eq(explorerCache.key, key);
  const [row] = await db.select({ body: explorerCache.body, fetchedAt: explorerCache.fetchedAt }).from(explorerCache).where(where).limit(1);
  return row ? { body: row.body, fetchedAt: new Date(row.fetchedAt) } : null;
}

export async function storeExplorer(db: Database, key: string, body: unknown, at: Date = new Date()): Promise<void> {
  await db
    .insert(explorerCache)
    .values({ key, body, fetchedAt: at })
    .onConflictDoUpdate({ target: explorerCache.key, set: { body, fetchedAt: at } });
}

/**
 * Keeps the cache bounded: drops answers older than `before`, then the oldest
 * beyond `keep` rows. Returns how many rows went.
 */
export async function pruneExplorerCache(db: Database, before: Date, keep: number): Promise<number> {
  const old = await db.delete(explorerCache).where(lt(explorerCache.fetchedAt, before)).returning({ key: explorerCache.key });
  let removed = old.length;
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(explorerCache);
  const extra = Number(n) - keep;
  if (extra > 0) {
    const victims = await db.select({ key: explorerCache.key }).from(explorerCache).orderBy(asc(explorerCache.fetchedAt)).limit(extra);
    if (victims.length) {
      await db.delete(explorerCache).where(
        inArray(
          explorerCache.key,
          victims.map((v) => v.key),
        ),
      );
      removed += victims.length;
    }
  }
  return removed;
}

/** A finished game from the standard start, as the explorer backfill reads it. */
export interface ExplorerBackfillGame {
  id: string;
  winner: 'w' | 'b' | null;
  whiteRating: number | null;
  blackRating: number | null;
  moves: string[];
}

/** Where the backfill got to: the last game read, by when it ended. */
export interface ExplorerBackfillCursor {
  endedAt: string;
  id: string;
}

/**
 * Finished games from the standard start that ended at or before `until`,
 * after `cursor`, in the order they ended (`limit` at a time), with their
 * first `plies` moves. Counts the games that finished before the explorer
 * existed; later games are counted as they finish.
 */
export async function explorerBackfillPage(
  db: Database,
  o: { startFen: string; cursor: ExplorerBackfillCursor | null; until: Date; limit: number; plies: number },
): Promise<{ games: ExplorerBackfillGame[]; cursor: ExplorerBackfillCursor | null }> {
  const conds = [eq(games.status, 'finished'), eq(games.initialFen, o.startFen), lte(games.endedAt, o.until), gt(games.plyCount, 1)];
  if (o.cursor) conds.push(sql`(${games.endedAt}, ${games.id}) > (${new Date(o.cursor.endedAt)}, ${o.cursor.id})`);
  const rows = await db
    .select({
      id: games.id,
      winner: games.winner,
      whiteRating: games.whiteRatingBefore,
      blackRating: games.blackRatingBefore,
      endedAt: games.endedAt,
    })
    .from(games)
    .where(and(...conds))
    .orderBy(asc(games.endedAt), asc(games.id))
    .limit(o.limit);
  if (!rows.length) return { games: [], cursor: null };
  const byGame = new Map<string, string[]>();
  const ms = await db
    .select({ gameId: moves.gameId, uci: moves.uci })
    .from(moves)
    .where(
      and(
        inArray(
          moves.gameId,
          rows.map((r) => r.id),
        ),
        lte(moves.ply, o.plies),
      ),
    )
    .orderBy(asc(moves.gameId), asc(moves.ply));
  for (const m of ms) {
    const list = byGame.get(m.gameId) ?? [];
    list.push(m.uci);
    byGame.set(m.gameId, list);
  }
  const last = rows[rows.length - 1]!;
  return {
    games: rows
      .filter((r) => byGame.has(r.id))
      .map((r) => ({
        id: r.id,
        winner: r.winner ?? null,
        whiteRating: r.whiteRating ?? null,
        blackRating: r.blackRating ?? null,
        moves: byGame.get(r.id)!,
      })),
    cursor: { endedAt: new Date(last.endedAt!).toISOString(), id: last.id },
  };
}
