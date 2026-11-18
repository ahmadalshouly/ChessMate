import type { GameReview } from '@chessmate/core';
import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { gameReviews } from '../schema';

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
