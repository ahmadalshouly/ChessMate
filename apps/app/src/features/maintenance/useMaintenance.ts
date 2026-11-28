import { maintenanceInForce } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { apiRequest } from '@/lib/social/api';

/** What the server's GET /api/maintenance says. */
export interface MaintenanceInfo {
  active: boolean;
  title: string;
  description: string;
  endsAt: number | null;
  autoEnd: boolean;
}

export interface MaintenanceView {
  /** The first check has answered (or timed out): until then the web app keeps its cover up. */
  ready: boolean;
  /** The maintenance page is in force for non-admins now. */
  inForce: boolean;
  info: MaintenanceInfo | null;
}

/**
 * Web maintenance mode, as staff set it in Admin → Maintenance. Web only:
 * the iPhone and Android apps never ask and always see `inForce: false`.
 *
 * Checked when the site opens, every minute (every 20 seconds while the page
 * is up, so visitors are let in soon after it ends) and whenever the tab comes
 * back into view. The last answer is kept in the browser, so if the server is
 * down for maintenance itself the page stays up instead of a broken site.
 */
const WEB = Platform.OS === 'web';
const STORE_KEY = 'chessmate.maintenance';
const FIRST_CHECK_TIMEOUT_MS = 2500;

function readStored(): MaintenanceInfo | null {
  if (!WEB) return null;
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as MaintenanceInfo) : null;
  } catch {
    return null;
  }
}

function store(v: MaintenanceInfo) {
  try {
    if (v.active) globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(v));
    else globalThis.localStorage?.removeItem(STORE_KEY);
  } catch {
    // Private mode or storage off: the next check asks the server again.
  }
}

let info: MaintenanceInfo | null = readStored();
let ready = !WEB || info != null;
let pending: Promise<void> | null = null;
let started = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

const view = (): MaintenanceView => ({
  ready,
  inForce: WEB && maintenanceInForce(info),
  info,
});

function check(): Promise<void> {
  if (!WEB) return Promise.resolve();
  if (pending) return pending;
  pending = apiRequest<MaintenanceInfo>('GET', '/api/maintenance', undefined, {
    optionalAuth: true,
  })
    .then((r) => {
      const next: MaintenanceInfo = {
        active: !!r.active,
        title: r.title ?? '',
        description: r.description ?? '',
        endsAt: r.endsAt ?? null,
        autoEnd: !!r.autoEnd,
      };
      info = next;
      store(next);
    })
    .catch(() => {
      // An older server (no such route) or the server is down: keep the last known answer.
    })
    .finally(() => {
      pending = null;
      ready = true;
      emit();
    });
  return pending;
}

function start() {
  if (started || !WEB) return;
  started = true;
  void check();
  // Never hold the site back for long if the server is slow to answer.
  setTimeout(() => {
    if (!ready) {
      ready = true;
      emit();
    }
  }, FIRST_CHECK_TIMEOUT_MS);
  const loop = () => {
    setTimeout(() => void check().finally(loop), maintenanceInForce(info) ? 20_000 : 60_000);
  };
  loop();
  globalThis.document?.addEventListener?.('visibilitychange', () => {
    if (globalThis.document?.visibilityState === 'visible') void check();
  });
}

/** Asks the server again now (the maintenance page's countdown calls this when it runs out). */
export function recheckMaintenance(): Promise<void> {
  return check();
}

export function useMaintenance(): MaintenanceView {
  const [v, setV] = useState(view);
  useEffect(() => {
    const l = () => setV(view());
    listeners.add(l);
    start();
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
