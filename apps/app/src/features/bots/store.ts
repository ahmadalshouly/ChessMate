import type { BotGameResult, OnlineBot } from '@chessmate/core';
import { useEffect, useSyncExternalStore } from 'react';

import { botsApi } from '../../lib/botsApi';

/**
 * The online computer opponents (bots staff create in the console, such as a
 * streamer's bot). They only exist while the server answers: nothing is kept
 * on the device, so a bot staff switch off is gone on the next refresh, and
 * offline the picker simply shows the built-in bots.
 */
const REFRESH_MS = 2 * 60_000;

export type OnlineBotsState = { status: 'loading' | 'ready' | 'offline'; bots: readonly OnlineBot[] };

let state: OnlineBotsState = { status: 'loading', bots: [] };
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: OnlineBotsState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function refreshOnlineBots(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && lastFetch && Date.now() - lastFetch < REFRESH_MS) return Promise.resolve();
  lastFetch = Date.now();
  inflight = botsApi
    .list()
    .then((r) => set({ status: 'ready', bots: Array.isArray(r.bots) ? r.bots : [] }))
    // Offline, or a server without online bots: only the built-in ones show.
    .catch(() => {
      lastFetch = 0;
      set({ status: 'offline', bots: [] });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The online bots, asking the server at most every couple of minutes while mounted. */
export function useOnlineBots(): OnlineBotsState {
  useEffect(() => {
    void refreshOnlineBots();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Counts a finished game against an online bot. Failures are ignored: it is a courtesy count, not a record. */
export function reportOnlineBotResult(id: string, result: BotGameResult) {
  void botsApi.result(id, result).catch(() => {});
}

/** Drops everything, for tests. */
export function resetOnlineBots() {
  state = { status: 'loading', bots: [] };
  lastFetch = 0;
}
