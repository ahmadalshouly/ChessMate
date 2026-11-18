import type { AdminTournament, TournamentDetail, TournamentList, TournamentSettings } from '@chessmate/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';

const id = (s: string) => encodeURIComponent(s);

/** Players' tournament API (/api/tournaments). Reading works signed out. */
export function useTournamentsApi() {
  const { apiFetch } = useAuth();
  return useMemo(
    () => ({
      list: () => apiFetch<TournamentList>('/api/tournaments'),
      detail: (tid: string) => apiFetch<{ tournament: TournamentDetail }>(`/api/tournaments/${id(tid)}`).then((r) => r.tournament),
      join: (tid: string) => apiFetch<{ tournament: TournamentDetail }>(`/api/tournaments/${id(tid)}/join`, { method: 'POST' }).then((r) => r.tournament),
      leave: (tid: string) => apiFetch<{ tournament: TournamentDetail }>(`/api/tournaments/${id(tid)}/leave`, { method: 'POST' }).then((r) => r.tournament),
    }),
    [apiFetch],
  );
}

/** Staff tournament tools (/api/admin/tournaments). */
export function useAdminTournamentsApi() {
  const { apiFetch } = useAuth();
  return useMemo(() => {
    const post = (path: string, body: Record<string, unknown> = {}) =>
      apiFetch<{ tournament: AdminTournament }>(`/api/admin/tournaments${path}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.tournament);
    return {
      list: (status: string) => apiFetch<{ tournaments: AdminTournament[] }>(`/api/admin/tournaments?status=${id(status)}`).then((r) => r.tournaments),
      get: (tid: string) => apiFetch<{ tournament: AdminTournament }>(`/api/admin/tournaments/${id(tid)}`).then((r) => r.tournament),
      create: (s: TournamentSettings) => post('', s as unknown as Record<string, unknown>),
      update: (tid: string, s: Partial<TournamentSettings>) => post(`/${id(tid)}/update`, s as Record<string, unknown>),
      start: (tid: string) => post(`/${id(tid)}/start`),
      finish: (tid: string) => post(`/${id(tid)}/finish`),
      cancel: (tid: string, reason: string) => post(`/${id(tid)}/cancel`, { reason }),
      remove: (tid: string, userId: string, reason: string) => post(`/${id(tid)}/remove`, { userId, reason }),
      prizePaid: (tid: string, userId: string, paid: boolean) => post(`/${id(tid)}/prize`, { userId, paid }),
    };
  }, [apiFetch]);
}

/**
 * Loads something and reloads it every `everyMs` while the app is in the
 * foreground (0 = load once). Keeps the last good value on errors.
 */
export function usePolling<T>(load: () => Promise<T>, everyMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    try {
      const d = await run();
      if (live.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (live.current) setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    live.current = true;
    setLoading(true);
    void reload();
    let timer: ReturnType<typeof setInterval> | undefined;
    const startTimer = () => {
      if (everyMs > 0 && !timer) timer = setInterval(() => void reload(), everyMs);
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    startTimer();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void reload();
        startTimer();
      } else stopTimer();
    });
    return () => {
      live.current = false;
      stopTimer();
      sub.remove();
    };
  }, [reload, everyMs]);
  return { data, setData, error, loading, reload };
}

/** Ticks once a second, for countdowns. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
