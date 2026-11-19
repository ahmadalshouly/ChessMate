import type { HabitsView, PlayLimitSettings } from '@chessmate/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { playClient } from './playClient';
import { apiRequest } from './social/api';
import { useSocialIdentity } from './social/session';

/**
 * Play limits and the streak for the signed-in player. The server decides and
 * enforces; this keeps its latest view for the header, banners and settings.
 *
 * A break is also remembered on the device (until it ends), so signing out and
 * playing as a guest on the same phone or browser doesn't get around it.
 */
interface HabitsStore {
  habits: HabitsView | null;
  /** End of a break this device knows about (survives sign-out and restarts). */
  deviceLock: number | null;
}

const KEY = 'chessmate.playLock';
let state: HabitsStore = { habits: null, deviceLock: null };
const listeners = new Set<() => void>();

function set(patch: Partial<HabitsStore>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function rememberLock(until: number | null) {
  if (!until || until <= Date.now()) return;
  if (state.deviceLock && state.deviceLock >= until) return;
  set({ deviceLock: until });
  const raw = String(until);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
    else void AsyncStorage.setItem(KEY, raw).catch(() => undefined);
  } catch {
    // Memory still holds it for this session.
  }
}

// The device lock from an earlier session.
try {
  const fromRaw = (raw: string | null | undefined) => {
    const n = Number(raw);
    if (Number.isFinite(n) && n > Date.now()) set({ deviceLock: n });
  };
  if (Platform.OS === 'web') fromRaw(globalThis.localStorage?.getItem(KEY));
  else void AsyncStorage.getItem(KEY).then(fromRaw, () => undefined);
} catch {
  // Storage unavailable.
}

const tz = () => -new Date().getTimezoneOffset();

export async function refreshHabits(): Promise<HabitsView | null> {
  const r = await apiRequest<{ habits: HabitsView }>('GET', `/api/me/habits?tz=${tz()}`).catch(() => null);
  if (!r) return null;
  set({ habits: r.habits });
  rememberLock(r.habits.lockedUntil);
  return r.habits;
}

export async function saveLimits(input: Partial<PlayLimitSettings>): Promise<HabitsView> {
  const r = await apiRequest<{ habits: HabitsView }>('POST', '/api/me/habits', input);
  set({ habits: r.habits });
  rememberLock(r.habits.lockedUntil);
  return r.habits;
}

/** A game against the computer finished on this device: counts for the streak and the limit. */
export async function reportComputerGame(plies: number): Promise<void> {
  const r = await apiRequest<{ habits: HabitsView }>('POST', '/api/me/habits/computer-game', { plies }).catch(() => null);
  if (!r) return;
  set({ habits: r.habits });
  rememberLock(r.habits.lockedUntil);
}

/** End of the current break (server or device), or null when play is allowed. */
export function currentPlayLock(now = Date.now()): number | null {
  const server = state.habits?.lockedUntil ?? null;
  const until = Math.max(server ?? 0, state.deviceLock ?? 0);
  return until > now ? until : null;
}

playClient.setPlayLockGuard(() => currentPlayLock());

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  playClient.onServerMessage((m) => {
    if (m.t === 'welcome' && m.playLock) rememberLock(m.playLock);
    if (m.t === 'playLock') {
      if (m.until) rememberLock(m.until);
      void refreshHabits();
    }
    // A finished game moves the streak (and maybe the limit).
    if (m.t === 'gameOver') setTimeout(() => void refreshHabits(), 800);
  });
  AppState.addEventListener('change', (s) => s === 'active' && void refreshHabits());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Habits for the signed-in player (null signed out), kept fresh. */
export function useHabits(): HabitsStore {
  const me = useSocialIdentity();
  useEffect(() => {
    wire();
    if (me) void refreshHabits();
    else set({ habits: null });
  }, [me]);
  return useSyncExternalStore(subscribe, () => state, () => state);
}
