import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { ReviewMode } from './localReview';

export type EngineBuild = 'lite' | 'full';

/** Engine and game review choices, kept on this device (a phone and a computer can differ). */
export interface ReviewSettings {
  /** How deep reviews search by default: standard, or Deep (slower, a little more accurate). */
  mode: ReviewMode;
  /** Which Stockfish runs on this device: the lite build, or the full one (web on computers, once downloaded; see fullEngine.ts). */
  engine: EngineBuild;
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { mode: 'standard', engine: 'lite' };
const MODES: readonly ReviewMode[] = ['standard', 'deep'];
const BUILDS: readonly EngineBuild[] = ['lite', 'full'];

const KEY = 'chessmate.review.v1';
let current: ReviewSettings = DEFAULT_REVIEW_SETTINGS;
const listeners = new Set<() => void>();

function normalize(raw: unknown): ReviewSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ReviewSettings, unknown>>;
  return {
    mode: MODES.includes(r.mode as ReviewMode) ? (r.mode as ReviewMode) : DEFAULT_REVIEW_SETTINGS.mode,
    engine: BUILDS.includes(r.engine as EngineBuild) ? (r.engine as EngineBuild) : DEFAULT_REVIEW_SETTINGS.engine,
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

export function setReviewSettings(patch: Partial<ReviewSettings>) {
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

/** The current choices, outside React. */
export const reviewSettings = (): ReviewSettings => current;

/** Told when the choices change. */
export function onReviewSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useReviewSettings(): ReviewSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
