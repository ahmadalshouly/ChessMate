import { DEFAULT_RATING, type Rating } from '@chessmate/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { ratingHistory, ratings, type RatingCategory, type RatingRow } from '../schema';

export async function getRatings(db: Database, userId: string): Promise<RatingRow[]> {
  return db.select().from(ratings).where(eq(ratings.userId, userId));
}

export async function getRating(db: Database, userId: string, category: RatingCategory): Promise<Rating> {
  const [r] = await db
    .select()
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.category, category)));
  return r ? { rating: r.rating, rd: r.rd, volatility: r.volatility } : DEFAULT_RATING;
}

/** All ratings for many users at once: userId -> category -> Rating. */
export async function getRatingsFor(db: Database, userIds: string[]) {
  const out = new Map<string, Partial<Record<RatingCategory, Rating>>>();
  if (userIds.length === 0) return out;
  for (const r of await db.select().from(ratings).where(inArray(ratings.userId, userIds))) {
    const m = out.get(r.userId) ?? {};
    m[r.category] = { rating: r.rating, rd: r.rd, volatility: r.volatility };
    out.set(r.userId, m);
  }
  return out;
}

export interface RatingUpdate {
  userId: string;
  category: RatingCategory;
  rating: Rating;
  /** 1 win, 0.5 draw, 0 loss; omit for a change that is not a game result. */
  score?: number;
  gameId?: string;
  puzzleAttemptId?: string;
}

/** Saves a new rating, bumps the W/L/D counters, and appends history. */
export async function saveRating(db: Database, u: RatingUpdate): Promise<void> {
  const { rating, rd, volatility } = u.rating;
  const win = u.score === 1 ? 1 : 0;
  const loss = u.score === 0 ? 1 : 0;
  const draw = u.score === 0.5 ? 1 : 0;
  const played = u.score === undefined ? 0 : 1;
  await db.transaction(async (tx) => {
    await tx
      .insert(ratings)
      .values({ userId: u.userId, category: u.category, rating, rd, volatility, games: played, wins: win, losses: loss, draws: draw, peak: rating })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.category],
        set: {
          rating,
          rd,
          volatility,
          games: sql`${ratings.games} + ${played}`,
          wins: sql`${ratings.wins} + ${win}`,
          losses: sql`${ratings.losses} + ${loss}`,
          draws: sql`${ratings.draws} + ${draw}`,
          peak: sql`greatest(coalesce(${ratings.peak}, 0), ${rating})`,
          updatedAt: new Date(),
        },
      });
    await tx.insert(ratingHistory).values({
      userId: u.userId,
      category: u.category,
      rating,
      rd,
      volatility,
      gameId: u.gameId,
      puzzleAttemptId: u.puzzleAttemptId,
    });
  });
}

/** Every stored rating row with its counters, for warming the server's rating cache at startup. */
export async function loadAllRatings(db: Database): Promise<RatingRow[]> {
  return db.select().from(ratings);
}
