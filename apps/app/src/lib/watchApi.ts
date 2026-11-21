import type {
  EventApplicationView,
  EventDetail,
  EventGameDetail,
  EventSummary,
  MyStreamerState,
  StreamerApplicationView,
  StreamerView,
} from '@chessmate/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { API_URL, apiRequest } from './social/api';

const api = <T>(method: string, path: string, body?: unknown, optionalAuth = false) => apiRequest<T>(method, `/api/watch${path}`, body, { optionalAuth });

export interface WatchMe {
  signedIn: boolean;
  isAdmin: boolean;
  canReviewStreamers: boolean;
}

export interface EventLists {
  live: EventSummary[];
  upcoming: EventSummary[];
  recent: EventSummary[];
  managed: EventSummary[];
}

type E = { event: EventDetail };

export const watchApi = {
  me: () => api<WatchMe>('GET', '/me', undefined, true),
  // Streamers
  streamers: () => api<{ streamers: StreamerView[] }>('GET', '/streamers', undefined, true).then((r) => r.streamers),
  streamer: (userId: string) => api<{ streamer: StreamerView | null }>('GET', `/streamers/${encodeURIComponent(userId)}`, undefined, true).then((r) => r.streamer),
  myStreamer: () => api<MyStreamerState>('GET', '/streamers/me'),
  applyStreamer: (body: { channels: { platform: string; url: string }[]; about: string }) => api<{ application: StreamerApplicationView }>('POST', '/streamers/apply', body),
  updateStreamer: (body: { headline: string; channels: { platform: string; url: string }[] }) => api<{ streamer: StreamerView }>('POST', '/streamers/me', body),
  goLive: (body: { title: string; url?: string }) => api<{ streamer: StreamerView }>('POST', '/streamers/me/live', body),
  endLive: () => api<{ streamer: StreamerView | null }>('DELETE', '/streamers/me/live'),
  streamerApplications: (status?: string) => api<{ applications: StreamerApplicationView[] }>('GET', `/streamer-applications${status ? `?status=${status}` : ''}`).then((r) => r.applications),
  reviewStreamer: (id: string, approve: boolean, note?: string) => api<{ application: StreamerApplicationView }>('POST', `/streamer-applications/${id}`, { approve, note }),
  removeStreamer: (userId: string) => api('DELETE', `/streamers/${userId}`),
  // Events
  events: () => api<EventLists>('GET', '/events', undefined, true),
  allEvents: () => api<{ events: EventSummary[] }>('GET', '/events/all').then((r) => r.events),
  event: (id: string) => api<E>('GET', `/events/${id}`, undefined, true).then((r) => r.event),
  createEvent: (body: object) => api<E>('POST', '/events', body).then((r) => r.event),
  updateEvent: (id: string, body: object) => api<E>('POST', `/events/${id}`, body).then((r) => r.event),
  setFlags: (id: string, flags: { published?: boolean; featured?: boolean; hidden?: boolean }) => api<E>('POST', `/events/${id}/flags`, flags).then((r) => r.event),
  deleteEvent: (id: string) => api('DELETE', `/events/${id}`),
  addOrganizer: (id: string, username: string) => api<E>('POST', `/events/${id}/organizers`, { username }).then((r) => r.event),
  removeOrganizer: (id: string, userId: string) => api<{ event: EventDetail | null }>('DELETE', `/events/${id}/organizers/${userId}`).then((r) => r.event),
  addPlayer: (id: string, body: object) => api<E>('POST', `/events/${id}/players`, body).then((r) => r.event),
  updatePlayer: (playerId: string, body: object) => api<E>('POST', `/players/${playerId}`, body).then((r) => r.event),
  removePlayer: (playerId: string) => api<E>('DELETE', `/players/${playerId}`).then((r) => r.event),
  addRound: (id: string, body: object) => api<E>('POST', `/events/${id}/rounds`, body).then((r) => r.event),
  updateRound: (roundId: string, body: object) => api<E>('POST', `/rounds/${roundId}`, body).then((r) => r.event),
  removeRound: (roundId: string) => api<E>('DELETE', `/rounds/${roundId}`).then((r) => r.event),
  pastePgn: (roundId: string, pgn: string, replace: boolean) => api<{ result: { games: number; changed: number } }>('POST', `/rounds/${roundId}/pgn`, { pgn, replace }).then((r) => r.result),
  addPairing: (roundId: string, body: { white: string; black: string; board?: number; result?: string }) => api<E>('POST', `/rounds/${roundId}/pairings`, body).then((r) => r.event),
  syncRound: (roundId: string) => api('POST', `/rounds/${roundId}/sync`),
  game: (gameId: string) => api<{ game: EventGameDetail }>('GET', `/games/${gameId}`, undefined, true).then((r) => r.game),
  setResult: (gameId: string, result: string) => api<E>('POST', `/games/${gameId}`, { result }).then((r) => r.event),
  removeGame: (gameId: string) => api<E>('DELETE', `/games/${gameId}`).then((r) => r.event),
  addNews: (id: string, body: { title: string; body: string }) => api<E>('POST', `/events/${id}/news`, body).then((r) => r.event),
  removeNews: (newsId: string) => api<E>('DELETE', `/news/${newsId}`).then((r) => r.event),
  // Applications to broadcast
  myEventApplications: () => api<{ applications: EventApplicationView[] }>('GET', '/event-applications').then((r) => r.applications),
  eventApplications: (status?: string) => api<{ applications: EventApplicationView[] }>('GET', `/event-applications/all${status ? `?status=${status}` : ''}`).then((r) => r.applications),
  applyEvent: (body: object) => api<{ application: EventApplicationView }>('POST', '/event-applications', body).then((r) => r.application),
  reviewEvent: (id: string, approve: boolean, note?: string) => api<{ application: EventApplicationView }>('POST', `/event-applications/${id}`, { approve, note }).then((r) => r.application),
  settings: () => api<{ settings: { lichessImport: boolean } }>('GET', '/settings').then((r) => r.settings),
  saveSettings: (body: { lichessImport: boolean }) => api<{ settings: { lichessImport: boolean } }>('POST', '/settings', body).then((r) => r.settings),
};

/** A logo path from the server: absolute for imported events, relative for uploads. */
export const eventLogoUri = (path: string | null) => (!path ? null : /^https?:\/\//.test(path) ? path : `${API_URL}${path}`);

/**
 * Loads something and keeps it fresh: every `fastMs` while `isLive(data)`,
 * otherwise every `slowMs`; paused while the app is in the background.
 */
export function usePolled<T>(load: (() => Promise<T>) | null, opts: { fastMs: number; slowMs: number; isLive?: (d: T) => boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const { fastMs, slowMs } = opts;
  const isLive = useRef(opts.isLive);
  isLive.current = opts.isLive;

  const refresh = useCallback(async () => {
    const f = loadRef.current;
    if (!f) return;
    try {
      const d = await f();
      setData(d);
      live.current = isLive.current?.(d) ?? false;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!load) return;
    setLoading(true);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = AppState.currentState === 'active';
    const loop = async () => {
      if (!alive) return;
      if (active) await refresh();
      if (alive) timer = setTimeout(loop, live.current ? fastMs : slowMs);
    };
    void loop();
    const sub = AppState.addEventListener('change', (s) => {
      const was = active;
      active = s === 'active';
      if (active && !was) {
        if (timer) clearTimeout(timer);
        void loop();
      }
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [load, refresh, fastMs, slowMs]);

  return { data, setData, error, loading, refresh };
}
