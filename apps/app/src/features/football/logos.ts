import { useSyncExternalStore } from 'react';

import { API_URL } from '@/lib/config';

/**
 * Club logo URLs from the game server (GET /api/football/logos), fetched once per app
 * session the first time a badge is drawn. Until they arrive, or for a club without
 * one, badges use the colour shield.
 */
let logos: Record<string, string> = {};
let requested = false;
/** Logo URLs that failed to load on this device; those clubs fall back to the shield. */
const broken = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  logos = { ...logos };
  for (const l of listeners) l();
}

function load() {
  if (requested) return;
  requested = true;
  // Ask again later when the server is unreachable or still looking logos up.
  const retry = (ms: number) => setTimeout(() => (requested = false), ms);
  fetch(`${API_URL}/api/football/logos`)
    .then((r) => (r.ok ? (r.json() as Promise<{ logos?: Record<string, string> }>) : null))
    .then((d) => {
      if (d?.logos && Object.keys(d.logos).length) {
        logos = d.logos;
        emit();
      } else retry(5 * 60_000);
    })
    .catch(() => retry(60_000));
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => listeners.delete(l);
}

/** Logo URL for a club, or null to draw the colour shield. */
export function useClubLogo(clubId: string): string | null {
  const all = useSyncExternalStore(subscribe, () => logos, () => logos);
  const url = all[clubId] ?? null;
  return url && !broken.has(url) ? url : null;
}

export function markLogoBroken(url: string) {
  if (broken.has(url)) return;
  broken.add(url);
  emit();
}
