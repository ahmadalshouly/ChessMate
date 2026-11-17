import { DEFAULT_SETTINGS, applySettingsPatch, normalizeSettings, type SettingsPatch, type UserSettings } from '@chessmate/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { AccountSession } from './session';

/**
 * App-wide settings. The server is the source of truth for signed-in users;
 * this module keeps the current value in memory (and on the device: localStorage
 * on web, AsyncStorage on iOS/Android) so the board, sounds and move confirmation
 * can read it anywhere without a provider, and guests keep their choices.
 */
const KEY = 'chessmate.settings.v1';
let current: UserSettings = readLocal();
const listeners = new Set<() => void>();
/** True once anything (server load or a user change) replaced the stored value. */
let touched = false;

if (Platform.OS !== 'web') {
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw && !touched) set(normalizeSettings(JSON.parse(raw)), false);
    })
    .catch(() => undefined);
}

function readLocal(): UserSettings {
  if (Platform.OS !== 'web') return DEFAULT_SETTINGS;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function set(next: UserSettings, persist = true) {
  current = next;
  if (persist) {
    touched = true;
    const raw = JSON.stringify(next);
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(KEY, raw);
      } catch {
        // Storage can be unavailable (private mode); memory still works.
      }
    } else {
      AsyncStorage.setItem(KEY, raw).catch(() => undefined);
    }
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getSettings(): UserSettings {
  return current;
}

/** Read settings anywhere (board, sounds, move confirmation). */
export function useSettings(): UserSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

let loadedFor: AccountSession | null = null;
let saver: ((patch: SettingsPatch) => Promise<void>) | null = null;

/**
 * Change settings from anywhere (board pickers, quick toggles). Applies at once and,
 * when signed in, saves to the account through the session registered by `SettingsBridge`.
 */
export function updateSettings(patch: SettingsPatch): Promise<void> {
  if (saver) return saver(patch);
  const local = applySettingsPatch(current, patch);
  if ('error' in local) return Promise.reject(new Error(local.error));
  set(local.settings);
  return Promise.resolve();
}

/** Mount once inside the auth provider: loads the account's settings at sign-in and routes `updateSettings` through the session. */
export function SettingsBridge({ session }: { session: AccountSession }) {
  const { update } = useSettingsSync(session);
  useEffect(() => {
    saver = update;
    return () => {
      if (saver === update) saver = null;
    };
  }, [update]);
  return null;
}

/** Settings plus an optimistic updater that saves to the server. */
export function useSettingsSync(session: AccountSession) {
  const settings = useSettings();

  useEffect(() => {
    if (!session.signedIn || loadedFor === session) return;
    loadedFor = session;
    session
      .apiFetch<UserSettings>('/api/me/settings')
      .then((s) => set(normalizeSettings(s)))
      .catch(() => {
        if (loadedFor === session) loadedFor = null;
      });
  }, [session]);

  const update = useCallback(
    async (patch: SettingsPatch) => {
      const before = current;
      const local = applySettingsPatch(before, patch);
      if ('error' in local) throw new Error(local.error);
      set(local.settings);
      if (!session.signedIn) return;
      try {
        set(normalizeSettings(await session.apiFetch<UserSettings>('/api/me/settings', { method: 'PATCH', body: patch })));
      } catch (e) {
        set(before);
        throw e;
      }
    },
    [session],
  );

  return { settings, update };
}
