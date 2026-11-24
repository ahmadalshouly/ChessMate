import AsyncStorage from '@react-native-async-storage/async-storage';
import { LESSON_CHAPTERS, type Lesson, type LessonCatalog, type LessonChapter } from '@chessmate/core';
import { useEffect, useSyncExternalStore } from 'react';

import { API_BASE } from '@/lib/puzzleApi';

/**
 * The lessons shown in the Learn tab. Staff edit them in the console and the
 * server serves the published ones at /api/lessons, so new lessons reach
 * players without an app release. The last catalog is kept on the device for
 * offline use; until one arrives, the lessons built into the app are shown.
 */
const KEY = 'chessmate.lessonCatalog.v1';
/** Ask the server again at most this often while the app is open. */
const REFRESH_MS = 10 * 60_000;

export interface LessonCatalogState {
  chapters: readonly LessonChapter[];
  lessons: readonly Lesson[];
  source: 'builtin' | 'saved' | 'server';
  version: string | null;
  /** The server has been asked at least once (answered or not). */
  checked: boolean;
}

function stateOf(chapters: readonly LessonChapter[], source: LessonCatalogState['source'], version: string | null, checked = false): LessonCatalogState {
  return { chapters, lessons: chapters.flatMap((c) => c.lessons), source, version, checked };
}

let state = stateOf(LESSON_CHAPTERS, 'builtin', null);
let restored = false;
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: LessonCatalogState) {
  state = next;
  for (const l of listeners) l();
}

/** A catalog from storage or the network, checked just enough to render safely. */
function isCatalog(v: unknown): v is LessonCatalog {
  if (!v || typeof v !== 'object') return false;
  const c = v as LessonCatalog;
  return (
    typeof c.version === 'string' &&
    Array.isArray(c.chapters) &&
    c.chapters.every((ch) => typeof ch?.id === 'string' && typeof ch.title === 'string' && Array.isArray(ch.lessons) && ch.lessons.every((l) => typeof l?.id === 'string' && Array.isArray(l.steps) && l.steps.length > 0))
  );
}

async function restore() {
  if (restored) return;
  restored = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as unknown) : null;
    // The network may have answered first; it wins.
    if (isCatalog(saved) && state.source === 'builtin') set(stateOf(saved.chapters, 'saved', saved.version, state.checked));
  } catch {
    // Unreadable cache: keep the built-in lessons.
  }
}

async function fetchCatalog() {
  lastFetch = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/lessons`, { headers: state.version ? { 'if-none-match': `"${state.version}"` } : undefined });
    if (res.status === 304) {
      set({ ...state, source: 'server', checked: true });
      return;
    }
    const body = res.ok ? ((await res.json()) as unknown) : null;
    if (!isCatalog(body) || body.chapters.length === 0) {
      set({ ...state, checked: true });
      return;
    }
    set(stateOf(body.chapters, 'server', body.version, true));
    await AsyncStorage.setItem(KEY, JSON.stringify(body)).catch(() => {});
  } catch {
    // Offline or server down: keep what we have.
    if (!state.checked) set({ ...state, checked: true });
  }
}

/** Loads the saved catalog, then asks the server for a newer one (at most every few minutes). */
export function refreshLessonCatalog(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && restored && Date.now() - lastFetch < REFRESH_MS) return Promise.resolve();
  inflight = restore()
    .then(fetchCatalog)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useLessonCatalog(): LessonCatalogState {
  useEffect(() => {
    void refreshLessonCatalog();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function findLesson(c: LessonCatalogState, id: string): Lesson | undefined {
  return c.lessons.find((l) => l.id === id);
}

export function lessonAfter(c: LessonCatalogState, id: string): Lesson | undefined {
  const i = c.lessons.findIndex((l) => l.id === id);
  return i >= 0 ? c.lessons[i + 1] : undefined;
}
