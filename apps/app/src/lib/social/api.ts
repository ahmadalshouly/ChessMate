import type {
  FeedItem,
  FriendEntry,
  FriendRequestEntry,
  LiveGameEntry,
  Presence,
  Relationship,
  SocialUser,
  UserWithRelationship,
} from '@chessmate/core';

import { SERVER_URL } from '@/lib/config';
import { getSocialIdentity } from './session';
import { translate } from '@/i18n';

/** HTTP base of the game server, derived from its WebSocket URL. */
export const API_URL = SERVER_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(method, `/api/social/${path}`, body);
}

/**
 * Calls the game server's HTTP API as the signed-in player (the same identity
 * as friends). `optionalAuth` sends the request without a token when signed out.
 */
export async function apiRequest<T>(method: string, path: string, body?: unknown, opts: { optionalAuth?: boolean } = {}): Promise<T> {
  const id = getSocialIdentity();
  if (!id && !opts.optionalAuth) throw new ApiError(401, translate('friends.signInRequired'));
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(id ? { authorization: `Bearer ${id.token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, translate('puzzles.home.unreachable'));
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data;
}

export interface Profile extends UserWithRelationship {
  presence: Presence | null;
  friends: number;
  followers: number;
}

export const socialApi = {
  search: (q: string) => call<UserWithRelationship[]>('GET', `search?q=${encodeURIComponent(q)}`),
  user: (id: string) => call<Profile>('GET', `users/${id}`),
  friends: () => call<FriendEntry[]>('GET', 'friends'),
  unfriend: (id: string) => call('DELETE', `friends/${id}`),
  requests: () => call<{ incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] }>('GET', 'requests'),
  sendRequest: (userId: string) => call<{ status: 'sent' | 'accepted' }>('POST', 'requests', { userId }),
  accept: (id: string) => call('POST', `requests/${id}/accept`),
  decline: (id: string) => call('POST', `requests/${id}/decline`),
  cancel: (id: string) => call('DELETE', `requests/${id}`),
  following: () => call<{ user: SocialUser; since: number; presence: Presence }[]>('GET', 'following'),
  followers: () => call<{ user: SocialUser; since: number }[]>('GET', 'followers'),
  follow: (id: string) => call('PUT', `following/${id}`),
  unfollow: (id: string) => call('DELETE', `following/${id}`),
  blocked: () => call<{ user: SocialUser; since: number }[]>('GET', 'blocks'),
  block: (id: string) => call('PUT', `blocks/${id}`),
  unblock: (id: string) => call('DELETE', `blocks/${id}`),
  live: () => call<LiveGameEntry[]>('GET', 'live'),
  feed: (before?: number) => call<{ items: FeedItem[]; next: number | null }>('GET', `feed${before ? `?before=${before}` : ''}`),
};

export type { Relationship };
