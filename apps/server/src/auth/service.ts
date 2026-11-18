import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { signJwt, verifyJwt } from './jwt';
import type { Mailer } from './mailer';
import { OAuthTokenError, type OAuthVerifier } from './oauth';
import { hashPassword, needsRehash, verifyPassword } from './passwords';
import { UniqueViolation, type AuthStore, type OAuthProvider, type SessionRecord, type StaffRole, type UserRecord } from './store';

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
  | 'not_found'
  | 'not_configured'
  | 'account_closed'
  | 'forbidden';

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
  /** Empty when the account has no email (Sign in with Apple without sharing one). */
  email: string;
  /** False for Google/Apple accounts that never set a password. */
  hasPassword: boolean;
  createdAt: string;
  /** "moderator" and "admin" open the admin console. */
  role: StaffRole;
  /**
   * Set when the account was closed for a fair-play violation. Such accounts
   * can still sign in (to read their messages, review games and appeal) but
   * cannot play online. Null for accounts in good standing.
   */
  restriction: AccountRestriction | null;
}

export interface AccountRestriction {
  reason: 'fair_play';
  /** ISO timestamp of the closure, when known. */
  since: string | null;
}

/** Closure reasons that still allow sign-in, with online play turned off. */
export const RESTRICTED_REASONS: ReadonlySet<string> = new Set(['fair_play']);
/** True when a closure with this reason blocks sign-in entirely. */
export const blocksSignIn = (reason: string | null | undefined): boolean => !!reason && !RESTRICTED_REASONS.has(reason);

/** Answers whether an account is closed right now (kept in memory by the admin service). */
export type AccountGuard = (userId: string) => { reason: string } | null;

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
  /** Verifies Google and Apple ID tokens. Without it, those sign-ins answer not_configured. */
  oauth?: OAuthVerifier;
  now?: () => number;
}

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const RESERVED = new Set(['admin', 'administrator', 'guest', 'chessmate', 'support', 'system', 'anonymous', 'moderator', 'root']);
const COMMON_PASSWORDS = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'chessmate', 'letmein1', '11111111', '00000000']);

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const opaqueToken = () => randomBytes(32).toString('base64url');

export function toPublicUser(u: UserRecord, guardReason?: string | null): PublicUser {
  const reason = u.closedAt ? (u.closedReason ?? 'other') : (guardReason ?? null);
  const restriction: AccountRestriction | null =
    reason === 'fair_play' ? { reason: 'fair_play', since: u.closedAt ? new Date(u.closedAt).toISOString() : null } : null;
  return {
    id: u.id,
    username: u.username,
    email: u.email ?? '',
    hasPassword: !!u.passwordHash,
    createdAt: new Date(u.createdAt).toISOString(),
    role: u.role ?? 'user',
    restriction,
  };
}

/** Message shown on the sign-in screen for a closed account. The app translates it by code and reason. */
export function closedAccountError(reason: string | null | undefined): AuthError {
  return new AuthError(
    'account_closed',
    reason === 'fair_play'
      ? 'This account was closed for violating the fair play policy'
      : 'This account has been closed. Contact support if you think this is a mistake',
    reason ?? undefined,
  );
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
  private readonly oauth: OAuthVerifier | undefined;
  private dummyHash: Promise<string> | null = null;
  /** Set by the admin service so closures take effect at once, without a store read per request. */
  accountGuard: AccountGuard | null = null;
  /** Called after an account is created; may return a staff role it was given (ADMIN_USERNAMES). */
  onAccountCreated: ((u: { id: string; username: string }) => Promise<StaffRole | null>) | null = null;

  constructor(opts: AuthServiceOptions) {
    if (opts.secret.length < 32) throw new Error('Auth secret must be at least 32 characters');
    this.store = opts.store;
    this.mailer = opts.mailer;
    this.secret = opts.secret;
    this.now = opts.now ?? Date.now;
    this.oauth = opts.oauth;
  }

  /** Which social sign-ins this server accepts, so the app can hide the others. */
  providers(): Record<OAuthProvider, boolean> {
    return { google: !!this.oauth?.enabled('google'), apple: !!this.oauth?.enabled('apple') };
  }

  /**
   * Sign in (or sign up) with a Google or Apple ID token. Finds the linked
   * account; otherwise links an existing account with the same verified email;
   * otherwise creates a new account with a username made from the name or email.
   */
  async oauthSignIn(provider: OAuthProvider, input: { idToken?: unknown; fullName?: unknown }): Promise<AuthResult & { created: boolean }> {
    if (!this.oauth?.enabled(provider)) {
      throw new AuthError('not_configured', `${provider === 'google' ? 'Google' : 'Apple'} sign-in is not set up on this server`);
    }
    if (typeof input.idToken !== 'string' || !input.idToken) throw new AuthError('invalid_input', 'Missing idToken');
    let id;
    try {
      id = await this.oauth.verify(provider, input.idToken);
    } catch (e) {
      if (e instanceof OAuthTokenError) throw new AuthError('invalid_token', `${provider === 'google' ? 'Google' : 'Apple'} sign-in failed: ${e.message}`);
      throw e;
    }

    let user = await this.store.findUserByOAuth(provider, id.subject);
    let created = false;
    if (!user && id.email && id.emailVerified) {
      user = await this.store.findUserByEmail(id.email);
      if (user) await this.store.linkOAuth(provider, id.subject, user.id);
    }
    if (!user) {
      const hint = typeof input.fullName === 'string' && input.fullName.trim() ? input.fullName : (id.name ?? id.email?.split('@')[0] ?? provider);
      const email = id.email && id.emailVerified && !(await this.store.findUserByEmail(id.email)) ? id.email : null;
      const now = this.now();
      for (let attempt = 0; !user; attempt++) {
        const candidate: UserRecord = { id: randomUUID(), username: usernameFrom(hint, attempt), email, passwordHash: null, createdAt: now, passwordChangedAt: now };
        try {
          await this.store.createUser(candidate);
          user = candidate;
        } catch (e) {
          if (!(e instanceof UniqueViolation) || attempt >= 12) throw e;
        }
      }
      await this.store.linkOAuth(provider, id.subject, user.id);
      created = true;
      user.role = (await this.onAccountCreated?.(user)) ?? user.role;
    }
    this.assertOpen(user);
    return { user: this.publicUser(user), tokens: await this.startSession(user), created };
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
    user.role = (await this.onAccountCreated?.(user)) ?? user.role;
    return { user: this.publicUser(user), tokens: await this.startSession(user) };
  }

  /** `login` is a username or an email address. */
  async login(input: { login?: unknown; password?: unknown }): Promise<AuthResult> {
    const login = typeof input.login === 'string' ? input.login.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!login || !password) throw new AuthError('invalid_input', 'Enter your username or email and password');
    const user = login.includes('@') ? await this.store.findUserByEmail(login) : await this.store.findUserByUsername(login);
    // Always run one hash so response time does not reveal whether the account exists.
    const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await this.getDummyHash()), false);
    if (!user || !user.passwordHash || !ok) throw new AuthError('invalid_credentials', 'Wrong username, email or password');
    this.assertOpen(user);
    if (needsRehash(user.passwordHash)) {
      user.passwordHash = await hashPassword(password);
      await this.store.updateUser(user);
    }
    return { user: this.publicUser(user), tokens: await this.startSession(user) };
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
    this.assertOpen(user);
    const { tokens, record } = await this.issue(user, session.familyId);
    await this.store.updateSession({ ...session, revokedAt: now, replacedBy: record.id });
    return { user: this.publicUser(user), tokens };
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
    await this.mailer.sendPasswordReset({ email, username: user.username }, token);
  }

  /** Sets a new password from a reset token and signs the user out everywhere. */
  async resetPassword(input: { token?: unknown; password?: unknown }): Promise<void> {
    const reset = typeof input.token === 'string' ? await this.store.findReset(sha256(input.token)) : undefined;
    const now = this.now();
    if (!reset || reset.usedAt || reset.expiresAt <= now) throw new AuthError('invalid_token', 'This reset link is invalid or has expired', 'token');
    const user = await this.store.getUser(reset.userId);
    if (!user) throw new AuthError('invalid_token', 'This reset link is invalid or has expired', 'token');
    const password = validatePassword(input.password, [user.username, user.email ?? '']);
    await this.store.updateReset({ ...reset, usedAt: now });
    await this.setPassword(user, password);
  }

  async changePassword(userId: string, currentPassword: unknown, newPassword: unknown): Promise<void> {
    const user = await this.store.getUser(userId);
    if (!user) throw new AuthError('unauthorized', 'Sign in again');
    // Google/Apple accounts without a password can set their first one while signed in.
    if (user.passwordHash && (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash)))) {
      throw new AuthError('invalid_credentials', 'Current password is wrong', 'currentPassword');
    }
    await this.setPassword(user, validatePassword(newPassword, [user.username, user.email ?? ''], 'newPassword'));
  }

  async checkPassword(userId: string, password: unknown): Promise<boolean> {
    const user = await this.store.getUser(userId);
    return !!user?.passwordHash && typeof password === 'string' && verifyPassword(password, user.passwordHash);
  }

  /** Deletes an account after re-checking its password (accounts without one only need to be signed in). */
  async deleteAccount(userId: string, password: unknown): Promise<void> {
    const user = await this.store.getUser(userId);
    if (user?.passwordHash && !(await this.checkPassword(userId, password))) throw new AuthError('invalid_credentials', 'Password is wrong', 'password');
    await this.store.revokeUserSessions(userId, this.now());
    await this.store.deleteUser(userId);
  }

  async getUser(userId: string): Promise<PublicUser | null> {
    const u = await this.store.getUser(userId);
    return u && !blocksSignIn(this.closedReason(u)) ? this.publicUser(u) : null;
  }

  /** Why the account is closed, or null when it is open. */
  private closedReason(u: UserRecord): string | null {
    if (u.closedAt) return u.closedReason ?? 'other';
    return this.accountGuard?.(u.id)?.reason ?? null;
  }

  private publicUser(u: UserRecord): PublicUser {
    return toPublicUser(u, this.accountGuard?.(u.id)?.reason);
  }

  /** Fair-play closures still sign in (restricted); every other closure is refused. */
  private assertOpen(u: UserRecord) {
    const reason = this.closedReason(u);
    if (blocksSignIn(reason)) throw closedAccountError(reason);
  }

  /**
   * Verifies an access token without a store lookup, so it is cheap enough for
   * every request and the WebSocket handshake. Tokens stay valid until expiry
   * (15 minutes) even after logout; refresh tokens are what logout revokes.
   */
  verifyAccessToken(token: string): AccessIdentity | null {
    const claims = verifyJwt(token, this.secret, Math.floor(this.now() / 1000));
    if (!claims || claims.typ !== 'access' || typeof claims.name !== 'string') return null;
    if (blocksSignIn(this.accountGuard?.(claims.sub)?.reason)) return null;
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

/** A free-looking username from a name or email: letters, digits and _, 3 to 20 characters. */
export function usernameFrom(hint: string, attempt = 0): string {
  let base = hint
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 15);
  if (base.length < 3 || RESERVED.has(base.toLowerCase())) base = `player${base ? `_${base}` : ''}`.slice(0, 15);
  if (attempt === 0) return base;
  const digits = attempt < 4 ? 2 : 4;
  return `${base}${Math.floor(10 ** (digits - 1) + Math.random() * 9 * 10 ** (digits - 1))}`;
}

const invalidToken = () => new AuthError('invalid_token', 'Session expired, sign in again');

/** Reads AUTH_SECRET; in development falls back to a per-process random secret. */
export function authSecretFromEnv(env = process.env): string {
  const s = env.AUTH_SECRET;
  if (s) return s;
  if (env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set in production');
  return randomBytes(32).toString('hex');
}
