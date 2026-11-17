/**
 * Storage boundary for accounts. The in-memory store is used in development
 * and tests; a database-backed store implements the same interface.
 */
export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  /** Bumped on password change/reset; refresh sessions created before it are invalid. */
  passwordChangedAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  /** All rotations of one login share a family; reuse of an old token revokes the family. */
  familyId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  replacedBy: string | null;
}

export interface ResetRecord {
  tokenHash: string;
  userId: string;
  expiresAt: number;
  usedAt: number | null;
}

export interface AuthStore {
  getUser(id: string): Promise<UserRecord | undefined>;
  findUserByUsername(username: string): Promise<UserRecord | undefined>;
  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  /** Must fail with UniqueViolation when the username or email is taken. */
  createUser(u: UserRecord): Promise<void>;
  updateUser(u: UserRecord): Promise<void>;
  /** Removes the user and everything keyed by them (sessions, resets). */
  deleteUser(id: string): Promise<void>;

  createSession(s: SessionRecord): Promise<void>;
  findSessionByTokenHash(hash: string): Promise<SessionRecord | undefined>;
  updateSession(s: SessionRecord): Promise<void>;
  revokeSessionFamily(familyId: string, at: number): Promise<void>;
  revokeUserSessions(userId: string, at: number): Promise<void>;

  createReset(r: ResetRecord): Promise<void>;
  findReset(tokenHash: string): Promise<ResetRecord | undefined>;
  updateReset(r: ResetRecord): Promise<void>;
}

export class UniqueViolation extends Error {
  constructor(readonly field: 'username' | 'email') {
    super(`${field} already exists`);
  }
}

export class MemoryAuthStore implements AuthStore {
  private users = new Map<string, UserRecord>();
  private byUsername = new Map<string, string>();
  private byEmail = new Map<string, string>();
  private sessions = new Map<string, SessionRecord>();
  private sessionByHash = new Map<string, string>();
  private resets = new Map<string, ResetRecord>();

  async getUser(id: string) {
    return this.users.get(id);
  }
  async findUserByUsername(username: string) {
    const id = this.byUsername.get(username.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }
  async findUserByEmail(email: string) {
    const id = this.byEmail.get(email.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }
  async createUser(u: UserRecord) {
    if (this.byUsername.has(u.username.toLowerCase())) throw new UniqueViolation('username');
    if (this.byEmail.has(u.email.toLowerCase())) throw new UniqueViolation('email');
    this.users.set(u.id, { ...u });
    this.byUsername.set(u.username.toLowerCase(), u.id);
    this.byEmail.set(u.email.toLowerCase(), u.id);
  }
  async updateUser(u: UserRecord) {
    const prev = this.users.get(u.id);
    if (!prev) return;
    const other = (m: Map<string, string>, k: string) => m.has(k) && m.get(k) !== u.id;
    if (other(this.byUsername, u.username.toLowerCase())) throw new UniqueViolation('username');
    if (other(this.byEmail, u.email.toLowerCase())) throw new UniqueViolation('email');
    this.byUsername.delete(prev.username.toLowerCase());
    this.byEmail.delete(prev.email.toLowerCase());
    this.users.set(u.id, { ...u });
    this.byUsername.set(u.username.toLowerCase(), u.id);
    this.byEmail.set(u.email.toLowerCase(), u.id);
  }
  async deleteUser(id: string) {
    const u = this.users.get(id);
    if (!u) return;
    this.users.delete(id);
    this.byUsername.delete(u.username.toLowerCase());
    this.byEmail.delete(u.email.toLowerCase());
    for (const [sid, s] of this.sessions) if (s.userId === id) (this.sessions.delete(sid), this.sessionByHash.delete(s.tokenHash));
    for (const [h, r] of this.resets) if (r.userId === id) this.resets.delete(h);
  }

  async createSession(s: SessionRecord) {
    this.sessions.set(s.id, { ...s });
    this.sessionByHash.set(s.tokenHash, s.id);
  }
  async findSessionByTokenHash(hash: string) {
    const id = this.sessionByHash.get(hash);
    const s = id ? this.sessions.get(id) : undefined;
    return s ? { ...s } : undefined;
  }
  async updateSession(s: SessionRecord) {
    this.sessions.set(s.id, { ...s });
  }
  async revokeSessionFamily(familyId: string, at: number) {
    for (const s of this.sessions.values()) if (s.familyId === familyId && !s.revokedAt) s.revokedAt = at;
  }
  async revokeUserSessions(userId: string, at: number) {
    for (const s of this.sessions.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = at;
  }

  async createReset(r: ResetRecord) {
    this.resets.set(r.tokenHash, { ...r });
  }
  async findReset(tokenHash: string) {
    const r = this.resets.get(tokenHash);
    return r ? { ...r } : undefined;
  }
  async updateReset(r: ResetRecord) {
    this.resets.set(r.tokenHash, { ...r });
  }
}
