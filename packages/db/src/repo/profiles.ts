import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { userProfiles, type UserProfileRow } from '../schema';

export async function allProfiles(db: Database): Promise<UserProfileRow[]> {
  return db.select().from(userProfiles);
}

export async function upsertProfile(db: Database, row: Omit<UserProfileRow, 'updatedAt'> & { updatedAt: Date }): Promise<void> {
  const { userId, ...rest } = row;
  await db.insert(userProfiles).values(row).onConflictDoUpdate({ target: userProfiles.userId, set: rest });
}

export async function deleteProfile(db: Database, userId: string): Promise<void> {
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
}
