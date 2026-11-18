import { oauthAccounts, passwordResets, refreshSessions, users, type Database } from '@chessmate/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { UniqueViolation, type AuthStore, type OAuthProvider, type ResetRecord, type SessionRecord, type UserRecord } from './store';

type UserRow = typeof users.$inferSelect;

const toDate = (ms: number) => new Date(ms);
const toMs = (d: Date | null | undefined) => (d ? d.getTime() : null);

/** Selects a user row plus whether a Google/Apple account is linked to it. */
const userColumns = {
  user: users,
  hasOAuth: sql<boolean>`exists (select 1 from ${oauthAccounts} where ${oauthAccounts.userId} = ${users.id})`,
};

function toUser({ user: r, hasOAuth }: { user: UserRow; hasOAuth: boolean }): UserRecord | undefined {
  // Dev-token players have no email, password or linked Google/Apple account and are not accounts.
  // Google/Apple accounts may have no password (login() rejects those) and, for Apple, no email.
  if (r.deletedAt || (!r.email && !r.passwordHash && !hasOAuth)) return undefined;
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    passwordHash: r.passwordHash,
    createdAt: r.createdAt.getTime(),
    passwordChangedAt: toMs(r.passwordChangedAt) ?? r.createdAt.getTime(),
    role: r.role,
    closedAt: toMs(r.closedAt),
    closedReason: r.closedReason,
  };
}

function toSession(r: typeof refreshSessions.$inferSelect): SessionRecord {
  return {
    id: r.id,
    userId: r.userId,
    familyId: r.familyId,
    tokenHash: r.tokenHash,
    createdAt: r.createdAt.getTime(),
    expiresAt: r.expiresAt.getTime(),
    revokedAt: toMs(r.revokedAt),
    replacedBy: r.replacedBy,
  };
}

/** Maps a Postgres unique violation on users to the field the sign-up form shows. */
function uniqueField(e: unknown): 'username' | 'email' | null {
  const err = e as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string; message?: string } };
  const c = err?.cause ?? err;
  if (c?.code !== '23505' && !/unique|duplicate/i.test(c?.message ?? '')) return null;
  const text = `${c?.constraint ?? ''} ${c?.message ?? ''}`;
  return /email/.test(text) ? 'email' : 'username';
}

/** Accounts, refresh sessions and reset tokens in Postgres (users, refresh_sessions, password_resets). */
export class DbAuthStore implements AuthStore {
  constructor(private readonly db: Database) {}

  async getUser(id: string) {
    const [r] = await this.db.select(userColumns).from(users).where(eq(users.id, id)).limit(1);
    return r ? toUser(r) : undefined;
  }

  async findUserByUsername(username: string) {
    const [r] = await this.db
      .select(userColumns)
      .from(users)
      .where(and(sql`lower(${users.username}) = ${username.toLowerCase()}`, isNull(users.deletedAt)))
      .limit(1);
    return r ? toUser(r) : undefined;
  }

  async findUserByEmail(email: string) {
    const [r] = await this.db
      .select(userColumns)
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
      .limit(1);
    return r ? toUser(r) : undefined;
  }

  async createUser(u: UserRecord) {
    if (await this.findUserByUsername(u.username)) throw new UniqueViolation('username');
    if (u.email && (await this.findUserByEmail(u.email))) throw new UniqueViolation('email');
    try {
      await this.db.insert(users).values({
        id: u.id,
        username: u.username,
        email: u.email?.toLowerCase() ?? null,
        passwordHash: u.passwordHash,
        passwordChangedAt: toDate(u.passwordChangedAt),
        displayName: u.username,
        createdAt: toDate(u.createdAt),
      });
    } catch (e) {
      const field = uniqueField(e);
      if (field) throw new UniqueViolation(field);
      throw e;
    }
  }

  async updateUser(u: UserRecord) {
    try {
      await this.db
        .update(users)
        .set({
          username: u.username,
          email: u.email?.toLowerCase() ?? null,
          passwordHash: u.passwordHash,
          passwordChangedAt: toDate(u.passwordChangedAt),
          updatedAt: new Date(),
        })
        .where(eq(users.id, u.id));
    } catch (e) {
      const field = uniqueField(e);
      if (field) throw new UniqueViolation(field);
      throw e;
    }
  }

  async deleteUser(id: string) {
    // Soft delete keeps game history; free the username and email for reuse.
    await this.db.delete(refreshSessions).where(eq(refreshSessions.userId, id));
    await this.db.delete(passwordResets).where(eq(passwordResets.userId, id));
    await this.db.delete(oauthAccounts).where(eq(oauthAccounts.userId, id));
    await this.db
      .update(users)
      .set({ deletedAt: new Date(), email: null, passwordHash: null, username: `deleted_${id.slice(0, 12)}` })
      .where(eq(users.id, id));
  }

  async createSession(s: SessionRecord) {
    await this.db.insert(refreshSessions).values({
      id: s.id,
      userId: s.userId,
      familyId: s.familyId,
      tokenHash: s.tokenHash,
      createdAt: toDate(s.createdAt),
      expiresAt: toDate(s.expiresAt),
      revokedAt: s.revokedAt === null ? null : toDate(s.revokedAt),
      replacedBy: s.replacedBy,
    });
  }

  async findSessionByTokenHash(hash: string) {
    const [r] = await this.db.select().from(refreshSessions).where(eq(refreshSessions.tokenHash, hash)).limit(1);
    return r ? toSession(r) : undefined;
  }

  async updateSession(s: SessionRecord) {
    await this.db
      .update(refreshSessions)
      .set({ revokedAt: s.revokedAt === null ? null : toDate(s.revokedAt), replacedBy: s.replacedBy, expiresAt: toDate(s.expiresAt) })
      .where(eq(refreshSessions.id, s.id));
  }

  async revokeSessionFamily(familyId: string, at: number) {
    await this.db
      .update(refreshSessions)
      .set({ revokedAt: toDate(at) })
      .where(and(eq(refreshSessions.familyId, familyId), isNull(refreshSessions.revokedAt)));
  }

  async revokeUserSessions(userId: string, at: number) {
    await this.db
      .update(refreshSessions)
      .set({ revokedAt: toDate(at) })
      .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)));
  }

  async findUserByOAuth(provider: OAuthProvider, subject: string) {
    const [r] = await this.db
      .select({ user: users })
      .from(oauthAccounts)
      .innerJoin(users, eq(users.id, oauthAccounts.userId))
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, subject)))
      .limit(1);
    return r ? toUser({ user: r.user, hasOAuth: true }) : undefined;
  }

  async linkOAuth(provider: OAuthProvider, subject: string, userId: string) {
    await this.db.insert(oauthAccounts).values({ provider, providerAccountId: subject, userId }).onConflictDoNothing();
  }

  async createReset(r: ResetRecord) {
    await this.db.insert(passwordResets).values({
      tokenHash: r.tokenHash,
      userId: r.userId,
      expiresAt: toDate(r.expiresAt),
      usedAt: r.usedAt === null ? null : toDate(r.usedAt),
    });
  }

  async findReset(tokenHash: string) {
    const [r] = await this.db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1);
    return r ? { tokenHash: r.tokenHash, userId: r.userId, expiresAt: r.expiresAt.getTime(), usedAt: toMs(r.usedAt) } : undefined;
  }

  async updateReset(r: ResetRecord) {
    await this.db
      .update(passwordResets)
      .set({ usedAt: r.usedAt === null ? null : toDate(r.usedAt), expiresAt: toDate(r.expiresAt) })
      .where(eq(passwordResets.tokenHash, r.tokenHash));
  }
}
