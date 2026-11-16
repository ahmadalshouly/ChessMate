/**
 * HTTP contract for /api/auth/*, agreed with the server's accounts module.
 *
 * POST /api/auth/signup          {username, email, password}   -> 201 AuthResponse
 * POST /api/auth/login           {login, password}             -> 200 AuthResponse   (login = username or email)
 * POST /api/auth/refresh         {refreshToken}                -> 200 AuthResponse   (refresh token rotates)
 * POST /api/auth/logout          {refreshToken, all?}          -> 204
 * GET  /api/auth/me              Bearer access token           -> 200 {user}
 * POST /api/auth/forgot-password {email}                       -> 202 (always, no account enumeration)
 * POST /api/auth/reset-password  {token, password}             -> 204
 * POST /api/auth/change-password {currentPassword, newPassword} Bearer -> 204
 *
 * Errors: non-2xx with {error: {code, message, field?}}. 401 means the access
 * token expired or is invalid. Access tokens live ~15 min, refresh tokens ~30
 * days; reusing a rotated refresh token revokes the session, so the client
 * must refresh at most once at a time and store the new pair before using it.
 */

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  /** ISO timestamp. */
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, ms since epoch. */
  accessExpiresAt: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export type AuthErrorCode =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'username_taken'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_token'
  | 'rate_limited'
  | 'network'
  | 'server';

export interface ApiErrorBody {
  error: { code: AuthErrorCode | string; message: string; field?: string };
}

/* ---------- Client-side validation (mirrors the server rules) ---------- */

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(v: string): string | null {
  if (!v) return 'Choose a username.';
  if (v.length < 3 || v.length > 20) return 'Use 3 to 20 characters.';
  if (!USERNAME_RULE.test(v)) return 'Letters, numbers and underscores only.';
  return null;
}

export function validateEmail(v: string): string | null {
  if (!v) return 'Enter your email.';
  return EMAIL_RULE.test(v) ? null : 'Enter a valid email address.';
}

export function validatePassword(v: string): string | null {
  if (!v) return 'Enter a password.';
  return v.length >= PASSWORD_MIN ? null : `Use at least ${PASSWORD_MIN} characters.`;
}

/** 0 (weak) to 3 (strong). A hint only; the server decides what is accepted. */
export function passwordStrength(v: string): 0 | 1 | 2 | 3 {
  if (v.length < PASSWORD_MIN) return 0;
  let variety = 0;
  if (/[a-z]/.test(v)) variety++;
  if (/[A-Z]/.test(v)) variety++;
  if (/\d/.test(v)) variety++;
  if (/[^A-Za-z0-9]/.test(v)) variety++;
  if (v.length >= 14 || variety >= 4) return 3;
  if (v.length >= 10 || variety >= 3) return 2;
  return 1;
}
