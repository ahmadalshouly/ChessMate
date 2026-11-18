import { translate } from '@/i18n';

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
 * GET  /api/auth/providers                                     -> 200 {providers: {google, apple}}
 * POST /api/auth/google          {idToken}                     -> 200/201 AuthResponse
 * POST /api/auth/apple           {idToken, fullName?}          -> 200/201 AuthResponse
 *
 * Errors: non-2xx with {error: {code, message, field?}}. 401 means the access
 * token expired or is invalid. Access tokens live ~15 min, refresh tokens ~30
 * days; reusing a rotated refresh token revokes the session, so the client
 * must refresh at most once at a time and store the new pair before using it.
 */

export interface AuthUser {
  id: string;
  username: string;
  /** Empty for Sign in with Apple accounts that did not share an email. */
  email: string;
  /** False for Google/Apple accounts that have not set a password. Missing on older servers. */
  hasPassword?: boolean;
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
  | 'server'
  | 'not_configured';

export interface ApiErrorBody {
  error: { code: AuthErrorCode | string; message: string; field?: string };
}

/* ---------- Client-side validation (mirrors the server rules) ---------- */

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(v: string): string | null {
  if (!v) return translate('auth.validate.usernameEmpty');
  if (v.length < 3 || v.length > 20) return translate('auth.validate.usernameLength');
  if (!USERNAME_RULE.test(v)) return translate('auth.validate.usernameChars');
  return null;
}

export function validateEmail(v: string): string | null {
  if (!v) return translate('auth.validate.emailEmpty');
  return EMAIL_RULE.test(v) ? null : translate('auth.validate.emailInvalid');
}

export function validatePassword(v: string): string | null {
  if (!v) return translate('auth.validate.passwordEmpty');
  return v.length >= PASSWORD_MIN ? null : translate('auth.validate.passwordShort', { min: PASSWORD_MIN });
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
