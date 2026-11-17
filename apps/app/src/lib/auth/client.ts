import { API_URL } from '@/lib/config';

import type { ApiErrorBody, AuthResponse, AuthUser } from './contract';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Low-level JSON request. Throws ApiError for HTTP and network failures. */
export async function request<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: rest.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : null),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
        ...(headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError(0, 'network', "Can't reach ChessMate right now. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204 || res.status === 202) {
    const text = await res.text().catch(() => '');
    return (text ? JSON.parse(text) : undefined) as T;
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    if (err && typeof err.code === 'string') throw new ApiError(res.status, err.code, err.message || 'Something went wrong.', err.field);
    throw new ApiError(res.status, res.status >= 500 ? 'server' : 'unknown', 'Something went wrong on our side. Please try again.');
  }
  return body as T;
}

const post = <T>(path: string, body: unknown, token?: string | null) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), token });

export const authApi = {
  signUp: (input: { username: string; email: string; password: string }) => post<AuthResponse>('/api/auth/signup', input),
  login: (input: { login: string; password: string }) => post<AuthResponse>('/api/auth/login', input),
  refresh: (refreshToken: string) => post<AuthResponse>('/api/auth/refresh', { refreshToken }),
  logout: (refreshToken: string, all = false) => post<void>('/api/auth/logout', { refreshToken, all }),
  me: (accessToken: string) => request<{ user: AuthUser }>('/api/auth/me', { token: accessToken }),
  forgotPassword: (email: string) => post<void>('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<void>('/api/auth/reset-password', { token, password }),
  changePassword: (accessToken: string, currentPassword: string, newPassword: string) =>
    post<void>('/api/auth/change-password', { currentPassword, newPassword }, accessToken),
};
