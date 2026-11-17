import { DEFAULT_SETTINGS, applySettingsPatch, normalizeSettings, type SettingsPatch, type UserSettings } from '@chessmate/core';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { AccountSession } from './session';

/**
 * App-wide settings. The server is the source of truth for signed-in users;
 * this module keeps the current value in memory (and in localStorage on the
 * web) so the board, sounds and move confirmation can read it anywhere
 * without a provider.
 */
const KEY = 'chessmate.settings.v1';
let current: UserSettings = readLocal();
const listeners = new Set<() => void>();

function readLocal(): UserSettings {
  if (Platform.OS !== 'web') return DEFAULT_SETTINGS;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function set(next: UserSettings) {
  current = next;
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode); memory still works.
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

let loaded = false;

/** Settings plus an optimistic updater that saves to the server. */
export function useSettingsSync(session: AccountSession) {
  const settings = useSettings();

  useEffect(() => {
    if (!session.signedIn || loaded) return;
    session
      .apiFetch<UserSettings>('/api/me/settings')
      .then((s) => {
        loaded = true;
        set(normalizeSettings(s));
      })
      .catch(() => undefined);
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
