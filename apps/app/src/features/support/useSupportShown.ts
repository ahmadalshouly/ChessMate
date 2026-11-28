import { useEffect, useState } from 'react';

import { donateApi } from '@/lib/communityApi';

/**
 * Whether "Support us" shows in the app. Staff switch it in Admin → Payments,
 * so it can disappear without a new build. Shown until the server says
 * otherwise (and when the server can't be reached), checked at most every
 * five minutes and shared by every screen that asks.
 */
let shown = true;
let checkedAt = 0;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

function refresh(): Promise<boolean> {
  if (pending) return pending;
  if (Date.now() - checkedAt < 5 * 60_000) return Promise.resolve(shown);
  pending = donateApi
    .info()
    .then((r) => r.shown !== false)
    .catch(() => shown)
    .then((v) => {
      checkedAt = Date.now();
      pending = null;
      if (v !== shown) {
        shown = v;
        for (const l of listeners) l(v);
      }
      return v;
    });
  return pending;
}

export function useSupportShown(): boolean {
  const [v, setV] = useState(shown);
  useEffect(() => {
    listeners.add(setV);
    void refresh();
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
