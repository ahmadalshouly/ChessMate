import type { GameReview } from '@chessmate/core';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { gameReviews } from '../schema';

/** Storage key of the saved review of an online game: one per game. */
export const gameReviewKey = (gameId: string) => `g:${gameId}`;

/** A stored engine review, or undefined when this game has not been reviewed yet. */
export async function getGameReview(db: Database, key: string): Promise<GameReview | undefined> {
  const [row] = await db.select({ review: gameReviews.review }).from(gameReviews).where(eq(gameReviews.key, key)).limit(1);
  return row?.review as GameReview | undefined;
}

/** Saves a finished review. Saving the same key twice keeps the first one. */
export async function saveGameReview(db: Database, key: string, review: GameReview, gameId?: string): Promise<void> {
  await db
    .insert(gameReviews)
    .values({ key, review, gameId: gameId ?? null })
    .onConflictDoNothing();
}

/** The saved review of an online game (the first one saved), or undefined. */
export async function getReviewForGame(db: Database, gameId: string): Promise<GameReview | undefined> {
  const [row] = await db
    .select({ review: gameReviews.review })
    .from(gameReviews)
    .where(eq(gameReviews.gameId, gameId))
    .orderBy(gameReviews.createdAt)
    .limit(1);
  return row?.review as GameReview | undefined;
}

/**
 * Saves the review of an online game, and returns the review that is now
 * saved for it. A game keeps its first review unless a later one searched
 * deeper (its shallowest search is deeper, as a Deep review's is): that one
 * replaces it. When two arrive together, the earlier one stays.
 */
export async function saveReviewForGame(db: Database, gameId: string, review: GameReview): Promise<GameReview> {
  const existing = await getReviewForGame(db, gameId);
  if (!existing) {
    await saveGameReview(db, gameReviewKey(gameId), review, gameId);
  } else if (deeperReview(review, existing)) {
    await db.update(gameReviews).set({ review }).where(eq(gameReviews.gameId, gameId));
  } else {
    return existing;
  }
  return (await getReviewForGame(db, gameId)) ?? review;
}

/** True when `a` searched deeper than `b`: its shallowest search is deeper. */
export function deeperReview(a: Pick<GameReview, 'depth'>, b: Pick<GameReview, 'depth'>): boolean {
  return a.depth > b.depth;
}

/** Accuracy per side of the reviewed games among `gameIds` (games without a review are left out). */
export async function reviewAccuracies(db: Database, gameIds: string[]): Promise<Map<string, { w: number; b: number }>> {
  const out = new Map<string, { w: number; b: number }>();
  if (!gameIds.length) return out;
  const rows = await db
    .select({
      gameId: gameReviews.gameId,
      w: sql<string | number | null>`${gameReviews.review}->'accuracy'->>'w'`,
      b: sql<string | number | null>`${gameReviews.review}->'accuracy'->>'b'`,
    })
    .from(gameReviews)
    .where(inArray(gameReviews.gameId, gameIds))
    .orderBy(gameReviews.createdAt);
  for (const r of rows) {
    if (!r.gameId || out.has(r.gameId)) continue;
    const w = Number(r.w);
    const b = Number(r.b);
    if (Number.isFinite(w) && Number.isFinite(b)) out.set(r.gameId, { w, b });
  }
  return out;
}
