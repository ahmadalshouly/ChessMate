import { eq, gt } from 'drizzle-orm';
import type { Database } from '../client';
import { playHabits, type PlayHabits } from '../schema';

/** A player's limits and streak row (undefined until they first play or set a limit). */
export async function getPlayHabits(db: Database, userId: string): Promise<PlayHabits | undefined> {
  const [row] = await db.select().from(playHabits).where(eq(playHabits.userId, userId));
  return row;
}

export async function savePlayHabits(db: Database, row: Omit<PlayHabits, 'updatedAt'>): Promise<void> {
  const { userId: _id, ...rest } = row;
  await db
    .insert(playHabits)
    .values({ ...row, updatedAt: new Date() })
    .onConflictDoUpdate({ target: playHabits.userId, set: { ...rest, updatedAt: new Date() } });
}

/** Players locked out right now, loaded at startup so the server can refuse games without a query. */
export async function activePlayLocks(db: Database, now: Date): Promise<{ userId: string; lockedUntil: Date }[]> {
  const rows = await db.select({ userId: playHabits.userId, lockedUntil: playHabits.lockedUntil }).from(playHabits).where(gt(playHabits.lockedUntil, now));
  return rows.filter((r): r is { userId: string; lockedUntil: Date } => !!r.lockedUntil);
}
