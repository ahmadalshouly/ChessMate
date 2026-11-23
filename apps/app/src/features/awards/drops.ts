import { useEffect, useId, useSyncExternalStore } from 'react';

/**
 * Award unlocks waiting to drop in from the top, one banner at a time.
 * Several places can show them (the app root, the full-screen result box);
 * the most recently mounted host shows the banner, so it is never hidden
 * under a modal.
 */
export interface AwardDrop {
  key: string;
  id: string;
  level: number;
  /** More awards from the same game, summed up as "+N more". */
  more: number;
}

let queue: AwardDrop[] = [];
let hosts: string[] = [];
const listeners = new Set<() => void>();
let seq = 0;

const emit = () => {
  for (const l of listeners) l();
};

/** Queues one banner per award (highest level only); a long list is shown as the best one plus a count. */
export function dropAwards(earned: { id: string; level: number }[]) {
  const best = new Map<string, number>();
  for (const e of earned) best.set(e.id, Math.max(best.get(e.id) ?? 0, e.level));
  const items = [...best].map(([id, level]) => ({ id, level })).sort((a, b) => b.level - a.level);
  if (!items.length) return;
  const shown = items.length > 3 ? items.slice(0, 2) : items;
  const rest = items.length - shown.length;
  queue = [...queue, ...shown.map((x, i) => ({ key: `a${++seq}`, ...x, more: i === shown.length - 1 ? rest : 0 }))];
  emit();
}

export function dismissDrop(key: string) {
  queue = queue.filter((d) => d.key !== key);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The banner this host should show now, or null (another host is on top, or nothing queued). */
export function useAwardDrop(): AwardDrop | null {
  const id = useId();
  useEffect(() => {
    hosts = [...hosts, id];
    emit();
    return () => {
      hosts = hosts.filter((h) => h !== id);
      emit();
    };
  }, [id]);
  return useSyncExternalStore(
    subscribe,
    () => (hosts[hosts.length - 1] === id ? (queue[0] ?? null) : null),
    () => null,
  );
}
