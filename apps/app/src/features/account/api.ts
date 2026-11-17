import { SERVER_URL } from '@/lib/config';

/** REST base derived from the game server URL (ws://host:8787/ws → http://host:8787). */
export const ACCOUNT_API_URL: string =
  process.env.EXPO_PUBLIC_API_URL || SERVER_URL.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/ws\/?$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ACCOUNT_API_URL + path, {
      method: init.method ?? 'GET',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the server. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string; message?: string; field?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Request failed (${res.status})`, data?.field);
  return data as T;
}
