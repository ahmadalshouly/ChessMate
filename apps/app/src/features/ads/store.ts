import type { AdCreative, AdSpotId } from '@chessmate/core';
import { useEffect, useSyncExternalStore } from 'react';

import { adsApi } from '@/lib/adsApi';

/**
 * The sponsors currently on the app's ad spots.
 *
 * One fetch serves every spot, because several spots can be on screen at once
 * and each must not cost a request. Nothing is kept on the device: a stale
 * sponsor is worse than no sponsor, and an empty list is a perfectly good
 * answer, so the spots simply stay blank until the server answers.
 */
const REFRESH_MS = 5 * 60_000;

let ads: readonly AdCreative[] = [];
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
/** Placements already counted as seen this session, so one view is one count. */
const seen = new Set<string>();

function set(next: readonly AdCreative[]) {
  ads = next;
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function refreshAds(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && lastFetch && Date.now() - lastFetch < REFRESH_MS) return Promise.resolve();
  lastFetch = Date.now();
  inflight = adsApi
    .list()
    .then((r) => set(Array.isArray(r.ads) ? r.ads : []))
    // Offline, or the server has no ad spots: the spots stay empty.
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The sponsor on one spot, or null when the spot is off, empty, or not loaded
 * yet. Mounting this asks the server at most once every few minutes.
 */
export function useAd(spot: AdSpotId): AdCreative | null {
  useEffect(() => {
    void refreshAds();
  }, []);
  const all = useSyncExternalStore(
    subscribe,
    () => ads,
    () => ads,
  );
  return all.find((a) => a.spot === spot) ?? null;
}

/** Counts one view per placement per session. Failures are ignored. */
export function countView(id: string) {
  if (seen.has(id)) return;
  seen.add(id);
  void adsApi.view(id).catch(() => {});
}

export function countClick(id: string) {
  void adsApi.click(id).catch(() => {});
}

/** Drops everything, for tests. */
export function resetAds() {
  ads = [];
  lastFetch = 0;
  seen.clear();
}
