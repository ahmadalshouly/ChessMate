import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Lesson progress on this device: the step each lesson was left on and the
 * lessons finished. Lessons work offline and for guests, so nothing is sent to
 * the server.
 */
export interface LessonProgress {
  /** Index of the step to resume on. */
  step: number;
  done: boolean;
}

export type ProgressMap = Readonly<Record<string, LessonProgress>>;

const KEY = 'chessmate.lessons.v1';
const EMPTY: ProgressMap = {};

let state: ProgressMap = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === 'object') {
        const clean: Record<string, LessonProgress> = {};
        for (const [id, v] of Object.entries(parsed as Record<string, Partial<LessonProgress>>)) {
          if (v && typeof v.step === 'number') clean[id] = { step: Math.max(0, Math.floor(v.step)), done: !!v.done };
        }
        // Anything saved while loading wins over what was on disk.
        state = { ...clean, ...state };
      }
    })
    .catch(() => {})
    .finally(() => {
      loaded = true;
      emit();
    });
  return loading;
}

function save() {
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

function update(id: string, next: (prev: LessonProgress) => LessonProgress) {
  state = { ...state, [id]: next(state[id] ?? { step: 0, done: false }) };
  emit();
  save();
}

/** Remembers the step a lesson is on, so it opens there next time. */
export function saveLessonStep(id: string, step: number) {
  if (state[id]?.step === step) return;
  update(id, (p) => ({ ...p, step }));
}

export function completeLesson(id: string) {
  update(id, () => ({ step: 0, done: true }));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** All lesson progress, and whether it has been read from storage yet. */
export function useLessonProgress(): { progress: ProgressMap; loaded: boolean } {
  useEffect(() => {
    void load();
  }, []);
  const progress = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const ready = useSyncExternalStore(subscribe, () => loaded, () => false);
  return { progress, loaded: ready };
}
