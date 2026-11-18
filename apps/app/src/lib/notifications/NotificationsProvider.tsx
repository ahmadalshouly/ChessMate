import type { AppNotification, NotificationPrefs } from '@chessmate/core';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { notificationsApi } from './api';
import { currentPushStatus, disablePush, enablePush, pushSupported, type PushStatus } from './push';
import { translate } from '@/i18n';

const POLL_MS = 30_000;

export interface NotificationsContextValue {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  /** Server unreachable or not signed in; the UI shows a quiet hint instead of failing. */
  offline: boolean;
  /** Newest notification that arrived while the app was open, for the in-app banner. */
  incoming: AppNotification | null;
  dismissIncoming: () => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  open: (n: AppNotification) => void;
  markRead: (ids: string[] | 'all') => Promise<void>;
  remove: (id: string) => Promise<void>;
  prefs: NotificationPrefs | null;
  updatePrefs: (patch: Record<string, unknown>) => Promise<void>;
  push: PushStatus;
  turnOnPush: () => Promise<void>;
  turnOffPush: () => Promise<void>;
}

const Ctx = createContext<NotificationsContextValue | null>(null);

if (pushSupported) {
  // Show banners while the app is open too; the list refreshes alongside.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

function go(url: string | null | undefined) {
  if (url && url.startsWith('/')) router.push(url as Href);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [incoming, setIncoming] = useState<AppNotification | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [push, setPush] = useState<PushStatus>({ state: 'unknown' });
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await notificationsApi.list();
      setItems(r.notifications);
      setUnread(r.unread);
      setHasMore(r.notifications.length >= 50);
      setOffline(false);
      // After the first load, surface anything new as an in-app banner.
      if (seen.current) {
        const fresh = r.notifications.find((n) => !seen.current!.has(n.id) && n.readAt === null);
        if (fresh) setIncoming(fresh);
      }
      seen.current = new Set(r.notifications.map((n) => n.id));
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const last = items.at(-1);
    if (!last) return;
    const r = await notificationsApi.list(last.createdAt).catch(() => null);
    if (!r) return;
    setItems((prev) => [...prev, ...r.notifications.filter((n) => !prev.some((p) => p.id === n.id))]);
    setHasMore(r.notifications.length >= 50);
  }, [items]);

  // Poll while the app is in the foreground and refresh when it comes back.
  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void refresh();
        timer ??= setInterval(() => void refresh(), POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  // Push: current status, foreground arrivals, and taps (including the tap that launched the app).
  useEffect(() => {
    if (!pushSupported) {
      setPush({ state: 'unsupported', reason: translate('notifications.pushNativeOnly') });
      return;
    }
    void currentPushStatus().then(setPush);
    const received = Notifications.addNotificationReceivedListener(() => void refresh());
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as Record<string, unknown> | undefined;
      if (typeof data?.id === 'string') void notificationsApi.markRead([data.id]).then(() => refresh()).catch(() => undefined);
      go(typeof data?.url === 'string' ? data.url : null);
    });
    const launch = Notifications.getLastNotificationResponse();
    const launchUrl = launch?.notification.request.content.data?.url;
    if (typeof launchUrl === 'string') setTimeout(() => go(launchUrl), 0);
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [refresh]);

  // Keep the app icon badge in step with the unread count.
  useEffect(() => {
    if (pushSupported) void Notifications.setBadgeCountAsync(unread).catch(() => undefined);
  }, [unread]);

  const markRead = useCallback(async (ids: string[] | 'all') => {
    const now = Date.now();
    setItems((prev) => prev.map((n) => (n.readAt === null && (ids === 'all' || ids.includes(n.id)) ? { ...n, readAt: now } : n)));
    const r = await notificationsApi.markRead(ids).catch(() => null);
    if (r) setUnread(r.unread);
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const r = await notificationsApi.remove(id).catch(() => null);
    if (r) setUnread(r.unread);
  }, []);

  const open = useCallback(
    (n: AppNotification) => {
      if (n.readAt === null) void markRead([n.id]);
      setIncoming((cur) => (cur?.id === n.id ? null : cur));
      go(n.url);
    },
    [markRead],
  );

  const loadPrefs = useCallback(async () => {
    const p = await notificationsApi.prefs().catch(() => null);
    if (p) setPrefs(p);
  }, []);
  useEffect(() => void loadPrefs(), [loadPrefs]);

  const updatePrefs = useCallback(async (patch: Record<string, unknown>) => {
    const next = await notificationsApi.savePrefs(patch).catch(() => null);
    if (next) setPrefs(next);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread,
      loading,
      offline,
      incoming,
      dismissIncoming: () => setIncoming(null),
      refresh,
      loadMore,
      hasMore,
      open,
      markRead,
      remove,
      prefs,
      updatePrefs,
      push,
      turnOnPush: async () => setPush(await enablePush()),
      turnOffPush: async () => {
        if (push.state === 'enabled') await disablePush(push.token);
        setPush({ state: 'unknown' });
      },
    }),
    [items, unread, loading, offline, incoming, refresh, loadMore, hasMore, open, markRead, remove, prefs, updatePrefs, push],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside NotificationsProvider');
  return v;
}
