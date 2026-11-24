import { mergeNotificationPrefs, defaultNotificationPrefs, type AppNotification, type NotificationPrefs } from '@chessmate/core';
import { SERVER_URL } from '../config';

/** HTTP base of the API. Same host as the game server unless EXPO_PUBLIC_API_URL is set. */
export const API_URL: string = (() => {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (typeof env === 'string' && env.length > 0) return env.replace(/\/+$/, '');
  return SERVER_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
})();

type TokenProvider = () => string | null | Promise<string | null>;

/**
 * The signed-in account's access token. Set by the root layout from the auth
 * session; signed out, there is no inbox to read.
 */
let provider: TokenProvider = () => null;
let account: string | null = null;
const listeners = new Set<() => void>();

/** `accountId` tells a token refresh apart from a different account signing in. */
export function setNotificationsTokenProvider(p: TokenProvider | null, accountId: string | null = null) {
  provider = p ?? (() => null);
  const next = p ? accountId : null;
  if (next === account) return;
  account = next;
  for (const l of listeners) l();
}

/** Called whenever the account behind the inbox changes (sign-in, sign-out, switch). */
export function onNotificationsAccountChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await provider();
  if (!token) throw new ApiError(401, 'Not signed in');
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const notificationsApi = {
  list: (before?: number) =>
    call<{ notifications: AppNotification[]; unread: number }>('GET', `/api/notifications?limit=50${before ? `&before=${before}` : ''}`),
  markRead: (ids: string[] | 'all') => call<{ unread: number }>('POST', '/api/notifications/read', ids === 'all' ? { all: true } : { ids }),
  remove: (id: string) => call<{ unread: number }>('DELETE', `/api/notifications/${encodeURIComponent(id)}`),
  prefs: async () => mergeNotificationPrefs(defaultNotificationPrefs(), await call<NotificationPrefs>('GET', '/api/notifications/prefs')),
  savePrefs: (patch: Partial<NotificationPrefs> | Record<string, unknown>) => call<NotificationPrefs>('PUT', '/api/notifications/prefs', patch),
  registerPushToken: async (token: string, platform: string) => {
    const r = await call<{ ok: true }>('POST', '/api/push-tokens', { token, platform });
    registeredToken = token;
    return r;
  },
  unregisterPushToken: async (token: string) => {
    if (registeredToken === token) registeredToken = null;
    return call<{ ok: true }>('DELETE', '/api/push-tokens', { token });
  },
};

/** This device's push token as last registered with the server for the signed-in account. */
let registeredToken: string | null = null;

/**
 * Called just before signing out, while the session still works: detaches
 * this phone from the account so the next person to use it does not get the
 * previous account's notifications. Gives up after 3 seconds so sign-out never
 * hangs on a slow network.
 */
export async function releasePushToken(): Promise<void> {
  const token = registeredToken;
  if (!token) return;
  registeredToken = null;
  await Promise.race([call('DELETE', '/api/push-tokens', { token }).catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
}
