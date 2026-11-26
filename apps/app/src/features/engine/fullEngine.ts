import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * The full Stockfish 19 for the web on computers: the same engine with its big
 * NNUE network, stronger at every depth than the lite build the app ships with
 * (1.8 MB), but a 99 MB download that needs about 100 MB more memory per
 * engine. Phones keep the lite one: in a phone's WebView that memory gets the
 * engine killed, and it would heat the phone more.
 *
 * Web builds carry it split in parts (scripts/full-engine.mjs). A player who
 * picks it in Settings downloads it once into this browser's cache storage;
 * the engines are then built from there (transport.web.ts), and only once
 * every part is in, so a review never waits on the download.
 */
export const FULL_ENGINE_BASE = '/engine/full/';
/** Engines the full build runs side by side at most (each needs about 150 MB). */
export const FULL_ENGINE_MAX = 2;
const CACHE_PREFIX = 'chessmate-engine-full-';

interface Manifest {
  version: string;
  bytes: number;
  parts: string[];
}

export type FullEngineStatus =
  /** Not offered here: not the web on a computer, or this build has no full engine. */
  | { state: 'unavailable' }
  | { state: 'checking' }
  | { state: 'absent'; bytes: number }
  | { state: 'downloading'; done: number; bytes: number }
  | { state: 'ready'; bytes: number }
  | { state: 'error'; bytes: number; message: string };

let status: FullEngineStatus = { state: 'checking' };
let manifest: Manifest | null = null;
let checked: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(s: FullEngineStatus) {
  status = s;
  listeners.forEach((l) => l());
}

/** True on the web on a computer with room for it (a mouse, and 4 GB of memory or more where the browser says). */
export function fullEngineSupported(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || typeof caches === 'undefined') return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memory === undefined || memory >= 4;
}

const cacheName = (m: Manifest) => CACHE_PREFIX + m.version;
const partUrl = (name: string) => new URL(FULL_ENGINE_BASE + name, window.location.href).href;

/** Looks up whether this build has the full engine and whether this browser has downloaded it. */
export function checkFullEngine(): Promise<void> {
  checked ??= (async () => {
    if (!fullEngineSupported()) return set({ state: 'unavailable' });
    try {
      const res = await fetch(FULL_ENGINE_BASE + 'manifest.json', { cache: 'no-cache' });
      const m = res.ok ? ((await res.json()) as Manifest) : null;
      if (!m || !Array.isArray(m.parts) || !m.parts.length) return set({ state: 'unavailable' });
      manifest = m;
      const cache = await caches.open(cacheName(m));
      const have = await Promise.all(m.parts.map((p) => cache.match(partUrl(p))));
      set(have.every(Boolean) ? { state: 'ready', bytes: m.bytes } : { state: 'absent', bytes: m.bytes });
    } catch {
      set({ state: 'unavailable' });
    }
  })();
  return checked;
}

/** Downloads the full engine into this browser's cache storage, reporting progress through the status. */
export async function downloadFullEngine(): Promise<boolean> {
  await checkFullEngine();
  const m = manifest;
  if (!m || status.state === 'downloading' || status.state === 'unavailable') return status.state === 'ready';
  if (status.state === 'ready') return true;
  let done = 0;
  set({ state: 'downloading', done, bytes: m.bytes });
  try {
    // Older versions' parts go first: one copy at a time.
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== cacheName(m)) await caches.delete(name);
    const cache = await caches.open(cacheName(m));
    for (const part of m.parts) {
      const url = partUrl(part);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        chunks.push(value);
        done += value.byteLength;
        set({ state: 'downloading', done, bytes: m.bytes });
      }
      await cache.put(url, new Response(new Blob(chunks as BlobPart[]), { headers: { 'content-type': 'application/octet-stream' } }));
    }
    set({ state: 'ready', bytes: m.bytes });
    return true;
  } catch (e) {
    await caches.delete(cacheName(m)).catch(() => undefined);
    set({ state: 'error', bytes: m.bytes, message: e instanceof Error ? e.message : 'Download failed' });
    return false;
  }
}

/** Frees the space the full engine takes in this browser. */
export async function removeFullEngine(): Promise<void> {
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
  if (manifest) set({ state: 'absent', bytes: manifest.bytes });
}

/** Where the engines find the full build (for transport.web.ts), or null while it is not downloaded. */
export function fullEngineSource(): { js: string; parts: string[]; cache: string } | null {
  if (status.state !== 'ready' || !manifest) return null;
  return { js: partUrl('stockfish.js'), parts: manifest.parts.map(partUrl), cache: cacheName(manifest) };
}

export function useFullEngine(): FullEngineStatus {
  useEffect(() => {
    void checkFullEngine();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}
