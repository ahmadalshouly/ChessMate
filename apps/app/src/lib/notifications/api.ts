import { mergeNotificationPrefs, defaultNotificationPrefs, type AppNotification, type NotificationPrefs } from '@chessmate/core';
import { Platform } from 'react-native';

import { SERVER_URL } from '../config';

/** HTTP base of the API. Same host as the game server unless EXPO_PUBLIC_API_URL is set. */
export const API_URL: string = (() => {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (typeof env === 'string' && env.length > 0) return env.replace(/\/+$/, '');
  return SERVER_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
})();

type TokenProvider = () => string | null | Promise<string | null>;

/**
 * Until accounts land, the app uses a development identity so the
 * notification center works locally. The accounts work should call
 * `setNotificationsTokenProvider(() => session?.token ?? null)`.
 */
function devToken(): string {
  const key = 'chessmate.devUser';
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(key);
      if (saved) return saved;
      const t = `dev:web-${Math.random().toString(36).slice(2, 10)}:You`;
      localStorage.setItem(key, t);
      return t;
    }
  } catch {
    // Storage blocked: fall through to a per-launch identity.
  }
  return `dev:${Platform.OS}-${Math.random().toString(36).slice(2, 10)}:You`;
}

let fallbackToken: string | null = null;
let provider: TokenProvider = () => (fallbackToken ??= devToken());

export function setNotificationsTokenProvider(p: TokenProvider) {
  provider = p;
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
  registerPushToken: (token: string, platform: string) => call<{ ok: true }>('POST', '/api/push-tokens', { token, platform }),
  unregisterPushToken: (token: string) => call<{ ok: true }>('DELETE', '/api/push-tokens', { token }),
};
