import {
  DEFAULT_EXPLORER_FILTERS,
  EXPLORER_SOURCES,
  normalizeExplorerFilters,
  type ExplorerFilters,
  type ExplorerSource,
} from '@chessmate/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** Dig Deep choices, kept on this device. */
export interface ExplorerSettings {
  source: ExplorerSource;
  /** Lichess collection only. */
  filters: Required<ExplorerFilters>;
  /** Engine evaluation of each listed move (on this device). */
  evals: boolean;
}

export const DEFAULT_EXPLORER_SETTINGS: ExplorerSettings = { source: 'lichess', filters: DEFAULT_EXPLORER_FILTERS, evals: true };

const KEY = 'chessmate.digdeep.v1';
let current: ExplorerSettings = DEFAULT_EXPLORER_SETTINGS;
const listeners = new Set<() => void>();

function normalize(raw: unknown): ExplorerSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ExplorerSettings, unknown>>;
  const source = EXPLORER_SOURCES.includes(r.source as ExplorerSource) ? (r.source as ExplorerSource) : DEFAULT_EXPLORER_SETTINGS.source;
  const filters = r.filters && typeof r.filters === 'object' ? normalizeExplorerFilters(r.filters as ExplorerFilters) : DEFAULT_EXPLORER_SETTINGS.filters;
  return { source, filters, evals: typeof r.evals === 'boolean' ? r.evals : DEFAULT_EXPLORER_SETTINGS.evals };
}

try {
  if (Platform.OS === 'web') {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) current = normalize(JSON.parse(raw));
  } else {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        current = normalize(JSON.parse(raw));
        listeners.forEach((l) => l());
      })
      .catch(() => undefined);
  }
} catch {
  // Unreadable storage: defaults.
}

export function setExplorerSettings(patch: Partial<ExplorerSettings>) {
  current = normalize({ ...current, ...patch });
  listeners.forEach((l) => l());
  const raw = JSON.stringify(current);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
    else void AsyncStorage.setItem(KEY, raw).catch(() => undefined);
  } catch {
    // Not kept; still applies for this session.
  }
}

export function useExplorerSettings(): ExplorerSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
