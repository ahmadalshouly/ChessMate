import type { TimeCategory } from '@chessmate/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { SERVER_URL } from '@/lib/config';

/** HTTP base of the game server, derived from its WebSocket URL (ws://host:8787/ws -> http://host:8787). */
export const API_BASE = SERVER_URL.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/ws\/?$/, '');

export type LeaderboardScope = 'global' | 'country' | 'friends';
export const LEADERBOARD_CATEGORIES: readonly TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  country: string | null;
  rating: number;
  provisional: boolean;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  peak: number;
}

export interface LeaderboardPage {
  category: TimeCategory;
  scope: LeaderboardScope;
  country: string | null;
  total: number;
  offset: number;
  entries: LeaderboardEntry[];
  you: LeaderboardEntry | null;
}

export interface ServerStats {
  playersOnline: number;
  gamesInProgress: number;
  playersSeeking: number;
  serverNow: number;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : undefined });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function fetchStats(): Promise<ServerStats> {
  return getJson('/api/stats');
}

export function fetchLeaderboard(
  q: { category: TimeCategory; scope: LeaderboardScope; country?: string | null; limit?: number; offset?: number },
  token?: string | null,
): Promise<LeaderboardPage> {
  const p = new URLSearchParams({ category: q.category, scope: q.scope });
  if (q.country) p.set('country', q.country);
  if (q.limit) p.set('limit', String(q.limit));
  if (q.offset) p.set('offset', String(q.offset));
  return getJson(`/api/leaderboard?${p}`, token);
}

/** Polls live server stats while the app is in the foreground. */
export function useServerStats(intervalMs = 15_000) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = () =>
      fetchStats()
        .then((s) => alive && (setStats(s), setOffline(false)))
        .catch(() => alive && setOffline(true));
    const start = () => {
      if (timer) return;
      load();
      timer = setInterval(load, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      alive = false;
      stop();
      sub.remove();
    };
  }, [intervalMs]);
  return { stats, offline };
}

const PAGE = 50;

/** Loads a leaderboard with "load more" paging. Reloads when the query changes. */
export function useLeaderboard(q: { category: TimeCategory; scope: LeaderboardScope; country?: string | null }, token?: string | null) {
  const [page, setPage] = useState<LeaderboardPage | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const req = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++req.current;
      setLoading(true);
      try {
        const next = await fetchLeaderboard({ ...q, limit: PAGE, offset }, token);
        if (id !== req.current) return;
        setError(null);
        setPage((prev) => (offset > 0 && prev ? { ...next, entries: [...prev.entries, ...next.entries] } : next));
      } catch (e) {
        if (id !== req.current) return;
        setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof ApiError ? e.message : 'Cannot reach the server' });
        if (offset === 0) setPage(null);
      } finally {
        if (id === req.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.category, q.scope, q.country, token],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const hasMore = !!page && page.entries.length < page.total;
  return {
    page,
    error,
    loading,
    refresh: () => load(0),
    loadMore: () => hasMore && !loading && load(page!.entries.length),
    hasMore,
  };
}

/** Flag emoji for an ISO 3166-1 alpha-2 code ("US" -> regional indicators). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
