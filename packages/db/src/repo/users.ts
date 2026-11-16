import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { users, type NewUser, type User } from '../schema';

export class UniqueViolation extends Error {
  constructor(readonly field: 'username' | 'email') {
    super(`${field} already taken`);
  }
}

/** Maps a Postgres unique-violation (23505) on users to UniqueViolation. */
function rethrowUnique(e: unknown): never {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = err.code ?? err.cause?.code;
  const constraint = err.constraint ?? err.cause?.constraint ?? '';
  if (code === '23505') throw new UniqueViolation(constraint.includes('email') ? 'email' : 'username');
  throw e;
}

export async function getUser(db: Database, id: string): Promise<User | undefined> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

export async function findUserByUsername(db: Database, username: string): Promise<User | undefined> {
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
  return u;
}

export async function findUserByEmail(db: Database, email: string): Promise<User | undefined> {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return u;
}

export async function createUser(db: Database, input: NewUser): Promise<User> {
  try {
    const [u] = await db
      .insert(users)
      .values({ ...input, email: input.email?.toLowerCase() ?? null })
      .returning();
    return u!;
  } catch (e) {
    rethrowUnique(e);
  }
}

export async function updateUser(db: Database, id: string, patch: Partial<NewUser>): Promise<User | undefined> {
  try {
    const [u] = await db
      .update(users)
      .set({ ...patch, ...(patch.email ? { email: patch.email.toLowerCase() } : {}), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return u;
  } catch (e) {
    rethrowUnique(e);
  }
}

export async function deleteUser(db: Database, id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

/** Creates the row if missing (used for dev-token players); never overwrites. */
export async function ensureUser(db: Database, input: NewUser & { id: string }): Promise<void> {
  await db.insert(users).values(input).onConflictDoNothing();
}
