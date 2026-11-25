import { asc, eq, sql } from 'drizzle-orm';

import type { Database } from '../client';
import { onlineBots, type OnlineBotRow } from '../schema';

export async function listOnlineBots(db: Database): Promise<OnlineBotRow[]> {
  return db.select().from(onlineBots).orderBy(asc(onlineBots.rating), asc(onlineBots.createdAt));
}

export async function onlineBot(db: Database, id: string): Promise<OnlineBotRow | null> {
  const [row] = await db.select().from(onlineBots).where(eq(onlineBots.id, id)).limit(1);
  return row ?? null;
}

export async function insertOnlineBot(db: Database, row: typeof onlineBots.$inferInsert): Promise<OnlineBotRow> {
  const [out] = await db.insert(onlineBots).values(row).returning();
  return out!;
}

export async function updateOnlineBot(db: Database, id: string, patch: Partial<typeof onlineBots.$inferInsert>): Promise<OnlineBotRow | null> {
  const [row] = await db.update(onlineBots).set(patch).where(eq(onlineBots.id, id)).returning();
  return row ?? null;
}

export async function deleteOnlineBot(db: Database, id: string): Promise<void> {
  await db.delete(onlineBots).where(eq(onlineBots.id, id));
}

/**
 * Counts one finished game and how it went for the player. One UPDATE, so
 * games finishing at the same moment cannot lose a count.
 */
export async function countOnlineBotGame(db: Database, id: string, result: 'win' | 'loss' | 'draw'): Promise<void> {
  const col = result === 'win' ? 'playerWins' : result === 'loss' ? 'botWins' : 'draws';
  const ref = result === 'win' ? onlineBots.playerWins : result === 'loss' ? onlineBots.botWins : onlineBots.draws;
  await db
    .update(onlineBots)
    .set({ games: sql`${onlineBots.games} + 1`, [col]: sql`${ref} + 1` })
    .where(eq(onlineBots.id, id));
}
