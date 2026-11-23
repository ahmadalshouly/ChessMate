import { ANALYSIS_LIMITS } from '@chessmate/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** Analysis board engine settings, kept on this device. */
export interface EngineSettings {
  /** Search depth, in plies. */
  depth: number;
  /** Lines shown (MultiPV), 1 to ANALYSIS_LIMITS.maxMultiPv. */
  lines: number;
  /** Longest the engine thinks about one position, in seconds. */
  seconds: number;
  /** Best-move arrows on the board. */
  arrows: boolean;
  /** Move grades (best, mistake, ...) on the board and in the move list. */
  grades: boolean;
}

export const DEPTH_CHOICES = [12, 16, 20, 24, 30] as const;
export const SECONDS_CHOICES = [3, 5, 10, 15] as const;
export const LINE_CHOICES = Array.from({ length: ANALYSIS_LIMITS.maxMultiPv }, (_, i) => i + 1);

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = { depth: 20, lines: 3, seconds: 10, arrows: true, grades: true };

const KEY = 'chessmate.engine.v1';
let current: EngineSettings = DEFAULT_ENGINE_SETTINGS;
const listeners = new Set<() => void>();

function normalize(raw: unknown): EngineSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof EngineSettings, unknown>>;
  const pick = <T extends number>(v: unknown, choices: readonly T[], d: T): T => (choices.includes(v as T) ? (v as T) : d);
  return {
    depth: pick(r.depth, DEPTH_CHOICES, DEFAULT_ENGINE_SETTINGS.depth as (typeof DEPTH_CHOICES)[number]),
    lines: pick(r.lines, LINE_CHOICES, DEFAULT_ENGINE_SETTINGS.lines),
    seconds: pick(r.seconds, SECONDS_CHOICES, DEFAULT_ENGINE_SETTINGS.seconds as (typeof SECONDS_CHOICES)[number]),
    arrows: typeof r.arrows === 'boolean' ? r.arrows : DEFAULT_ENGINE_SETTINGS.arrows,
    grades: typeof r.grades === 'boolean' ? r.grades : DEFAULT_ENGINE_SETTINGS.grades,
  };
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

export function setEngineSettings(patch: Partial<EngineSettings>) {
  current = normalize({ ...current, ...patch });
  const raw = JSON.stringify(current);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
    else void AsyncStorage.setItem(KEY, raw).catch(() => undefined);
  } catch {
    // Memory still works.
  }
  listeners.forEach((l) => l());
}

export function useEngineSettings(): EngineSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
