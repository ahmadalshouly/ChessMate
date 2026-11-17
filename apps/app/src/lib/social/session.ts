import { useSyncExternalStore } from 'react';

/**
 * Who the social screens act as. Sign-in sets the real access token with
 * `setSocialToken`; until then development builds can pick a dev identity
 * ("dev:<id>:<name>"), which the dev server turns into an account.
 */
export interface SocialIdentity {
  token: string;
  /** Account id when known, for "is this me" checks. */
  userId: string | null;
  name: string;
}

const KEY = 'chessmate.socialIdentity';
let current: SocialIdentity | null = load();
const listeners = new Set<() => void>();

function load(): SocialIdentity | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as SocialIdentity) : null;
  } catch {
    return null;
  }
}

export function setSocialIdentity(id: SocialIdentity | null) {
  current = id;
  try {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(KEY, JSON.stringify(id));
      else localStorage.removeItem(KEY);
    }
  } catch {
    // Storage is a convenience only.
  }
  for (const l of listeners) l();
}

/** For the sign-in flow: act as this account. */
export function setSocialToken(token: string, userId: string, name: string) {
  setSocialIdentity({ token, userId, name });
}

export function devIdentity(name: string): SocialIdentity {
  const clean = name.trim().replace(/[^\w-]/g, '_').slice(0, 20);
  const id = `dev-${clean.toLowerCase()}`;
  return { token: `dev:${id}:${clean}`, userId: id, name: clean };
}

export function getSocialIdentity() {
  return current;
}

export function useSocialIdentity(): SocialIdentity | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
