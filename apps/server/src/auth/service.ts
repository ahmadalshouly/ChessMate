import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { signJwt, verifyJwt } from './jwt';
import type { Mailer } from './mailer';
import { hashPassword, needsRehash, verifyPassword } from './passwords';
import { UniqueViolation, type AuthStore, type SessionRecord, type UserRecord } from './store';

export const ACCESS_TTL_MS = 15 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 3600_000;
export const RESET_TTL_MS = 30 * 60_000;

export type AuthErrorCode =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'username_taken'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_token'
  | 'rate_limited'
  | 'unauthorized'
  | 'not_found';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** Public account shape returned to clients. Never includes the password hash. */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, ms since epoch. */
  accessExpiresAt: number;
}

export interface AuthResult {
  user: PublicUser;
  tokens: Tokens;
}

export interface AccessIdentity {
  userId: string;
  username: string;
}

export interface AuthServiceOptions {
  store: AuthStore;
  mailer: Mailer;
  /** HMAC secret for access tokens; at least 32 characters. */
  secret: string;
  now?: () => number;
}

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const RESERVED = new Set(['admin', 'administrator', 'guest', 'chessmate', 'support', 'system', 'anonymous', 'moderator', 'root']);
const COMMON_PASSWORDS = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'chessmate', 'letmein1', '11111111', '00000000']);

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const opaqueToken = () => randomBytes(32).toString('base64url');

export function toPublicUser(u: UserRecord): PublicUser {
  return { id: u.id, username: u.username, email: u.email, createdAt: new Date(u.createdAt).toISOString() };
}

export function validateUsername(v: unknown): string {
  if (typeof v !== 'string' || !USERNAME.test(v.trim())) {
    throw new AuthError('invalid_input', 'Username must be 3 to 20 letters, numbers or _', 'username');
  }
  if (RESERVED.has(v.trim().toLowerCase())) throw new AuthError('username_taken', 'That username is not available', 'username');
  return v.trim();
}

export function validateEmail(v: unknown): string {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!EMAIL.test(e) || e.length > 254) throw new AuthError('invalid_input', 'Enter a valid email address', 'email');
  return e;
}

export function validatePassword(v: unknown, context: string[] = [], field = 'password'): string {
  if (typeof v !== 'string' || v.length < 8) throw new AuthError('weak_password', 'Password must be at least 8 characters', field);
  if (v.length > 200) throw new AuthError('invalid_input', 'Password is too long', field);
  const lower = v.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || new Set(v).size < 3 || context.some((c) => c && lower === c.toLowerCase())) {
    throw new AuthError('weak_password', 'Choose a less common password', field);
  }
  return v;
}

/**
 * Account authentication: email+password accounts, short-lived JWT access
 * tokens, rotating opaque refresh tokens with reuse detection, and a
 * single-use password reset flow.
 */
export class AuthService {
  readonly store: AuthStore;
  private readonly mailer: Mailer;
  private readonly secret: string;
  private readonly now: () => number;
  private dummyHash: Promise<string> | null = null;

  constructor(opts: AuthServiceOptions) {
    if (opts.secret.length < 32) throw new Error('Auth secret must be at least 32 characters');
    this.store = opts.store;
    this.mailer = opts.mailer;
    this.secret = opts.secret;
    this.now = opts.now ?? Date.now;
  }

  async signup(input: { username?: unknown; email?: unknown; password?: unknown }): Promise<AuthResult> {
    const username = validateUsername(input.username);
    const email = validateEmail(input.email);
    const password = validatePassword(input.password, [username, email, email.split('@')[0]!]);
    if (await this.store.findUserByUsername(username)) throw taken('username');
    if (await this.store.findUserByEmail(email)) throw taken('email');
    const now = this.now();
    const user: UserRecord = { id: randomUUID(), username, email, passwordHash: await hashPassword(password), createdAt: now, passwordChangedAt: now };
    try {
      await this.store.createUser(user);
    } catch (e) {
      if (e instanceof UniqueViolation) throw taken(e.field);
      throw e;
    }
    return { user: toPublicUser(user), tokens: await this.startSession(user) };
  }

  /** `login` is a username or an email address. */
  async login(input: { login?: unknown; password?: unknown }): Promise<AuthResult> {
    const login = typeof input.login === 'string' ? input.login.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!login || !password) throw new AuthError('invalid_input', 'Enter your username or email and password');
    const user = login.includes('@') ? await this.store.findUserByEmail(login) : await this.store.findUserByUsername(login);
    // Always run one hash so response time does not reveal whether the account exists.
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await this.getDummyHash()), false);
    if (!user || !ok) throw new AuthError('invalid_credentials', 'Wrong username, email or password');
    if (needsRehash(user.passwordHash)) {
      user.passwordHash = await hashPassword(password);
      await this.store.updateUser(user);
    }
    return { user: toPublicUser(user), tokens: await this.startSession(user) };
  }

  /** Rotates a refresh token. Reusing an already-rotated token revokes the whole session family. */
  async refresh(refreshToken: unknown): Promise<AuthResult> {
    const session = typeof refreshToken === 'string' ? await this.store.findSessionByTokenHash(sha256(refreshToken)) : undefined;
    const now = this.now();
    if (!session) throw invalidToken();
    if (session.revokedAt) {
      if (session.replacedBy) await this.store.revokeSessionFamily(session.familyId, now);
      throw invalidToken();
    }
    if (session.expiresAt <= now) throw invalidToken();
    const user = await this.store.getUser(session.userId);
    if (!user || session.createdAt < user.passwordChangedAt) throw invalidToken();
    const { tokens, record } = await this.issue(user, session.familyId);
    await this.store.updateSession({ ...session, revokedAt: now, replacedBy: record.id });
    return { user: toPublicUser(user), tokens };
  }

  /** Ends the session for this refresh token, or every session of its user when `all` is set. */
  async logout(refreshToken: unknown, all = false): Promise<void> {
    if (typeof refreshToken !== 'string') return;
    const session = await this.store.findSessionByTokenHash(sha256(refreshToken));
    if (!session) return;
    const now = this.now();
    if (all) await this.store.revokeUserSessions(session.userId, now);
    else await this.store.revokeSessionFamily(session.familyId, now);
  }

  /** Always resolves, whether or not the email has an account. */
  async forgotPassword(emailInput: unknown): Promise<void> {
    let email: string;
    try {
      email = validateEmail(emailInput);
    } catch {
      return;
    }
    const user = await this.store.findUserByEmail(email);
    if (!user) return;
    const token = opaqueToken();
    await this.store.createReset({ tokenHash: sha256(token), userId: user.id, expiresAt: this.now() + RESET_TTL_MS, usedAt: null });
    await this.mailer.sendPasswordReset({ email: user.email, username: user.username }, token);
  }

  /** Sets a new password from a reset token and signs the user out everywhere. */
  async resetPassword(input: { token?: unknown; password?: unknown }): Promise<void> {
    const reset = typeof input.token === 'string' ? await this.store.findReset(sha256(input.token)) : undefined;
    const now = this.now();
    if (!reset || reset.usedAt || reset.expiresAt <= now) throw new AuthError('invalid_token', 'This reset link is invalid or has expired', 'token');
    const user = await this.store.getUser(reset.userId);
    if (!user) throw new AuthError('invalid_token', 'This reset link is invalid or has expired', 'token');
    const password = validatePassword(input.password, [user.username, user.email]);
    await this.store.updateReset({ ...reset, usedAt: now });
    await this.setPassword(user, password);
  }

  async changePassword(userId: string, currentPassword: unknown, newPassword: unknown): Promise<void> {
    const user = await this.store.getUser(userId);
    if (!user) throw new AuthError('unauthorized', 'Sign in again');
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AuthError('invalid_credentials', 'Current password is wrong', 'currentPassword');
    }
    await this.setPassword(user, validatePassword(newPassword, [user.username, user.email], 'newPassword'));
  }

  async checkPassword(userId: string, password: unknown): Promise<boolean> {
    const user = await this.store.getUser(userId);
    return !!user && typeof password === 'string' && verifyPassword(password, user.passwordHash);
  }

  /** Deletes an account after re-checking its password. */
  async deleteAccount(userId: string, password: unknown): Promise<void> {
    if (!(await this.checkPassword(userId, password))) throw new AuthError('invalid_credentials', 'Password is wrong', 'password');
    await this.store.revokeUserSessions(userId, this.now());
    await this.store.deleteUser(userId);
  }

  async getUser(userId: string): Promise<PublicUser | null> {
    const u = await this.store.getUser(userId);
    return u ? toPublicUser(u) : null;
  }

  /**
   * Verifies an access token without a store lookup, so it is cheap enough for
   * every request and the WebSocket handshake. Tokens stay valid until expiry
   * (15 minutes) even after logout; refresh tokens are what logout revokes.
   */
  verifyAccessToken(token: string): AccessIdentity | null {
    const claims = verifyJwt(token, this.secret, Math.floor(this.now() / 1000));
    if (!claims || claims.typ !== 'access' || typeof claims.name !== 'string') return null;
    return { userId: claims.sub, username: claims.name };
  }

  // ---- internals ----

  private async setPassword(user: UserRecord, password: string) {
    const now = this.now();
    await this.store.updateUser({ ...user, passwordHash: await hashPassword(password), passwordChangedAt: now });
    await this.store.revokeUserSessions(user.id, now);
  }

  private async startSession(user: UserRecord): Promise<Tokens> {
    return (await this.issue(user, randomUUID())).tokens;
  }

  private async issue(user: UserRecord, familyId: string): Promise<{ tokens: Tokens; record: SessionRecord }> {
    const now = this.now();
    const refreshToken = opaqueToken();
    const record: SessionRecord = {
      id: randomUUID(),
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      createdAt: now,
      expiresAt: now + REFRESH_TTL_MS,
      revokedAt: null,
      replacedBy: null,
    };
    await this.store.createSession(record);
    const accessExpiresAt = now + ACCESS_TTL_MS;
    const accessToken = signJwt(
      { sub: user.id, name: user.username, typ: 'access', sid: familyId, iat: Math.floor(now / 1000), exp: Math.floor(accessExpiresAt / 1000) },
      this.secret,
    );
    return { tokens: { accessToken, refreshToken, accessExpiresAt }, record };
  }

  private getDummyHash() {
    return (this.dummyHash ??= hashPassword(opaqueToken()));
  }
}

const taken = (field: 'username' | 'email') =>
  field === 'username'
    ? new AuthError('username_taken', 'That username is taken', 'username')
    : new AuthError('email_taken', 'An account with this email already exists', 'email');

const invalidToken = () => new AuthError('invalid_token', 'Session expired, sign in again');

/** Reads AUTH_SECRET; in development falls back to a per-process random secret. */
export function authSecretFromEnv(env = process.env): string {
  const s = env.AUTH_SECRET;
  if (s) return s;
  if (env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set in production');
  return randomBytes(32).toString('hex');
}
