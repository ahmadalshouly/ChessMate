import { useSyncExternalStore } from 'react';

/**
 * Who the social screens (friends, messages, tournaments) act as: the
 * signed-in account. The app's auth bridge sets it at sign-in and clears it at
 * sign-out; requests ask `freshSocialToken()` so an expired access token is
 * refreshed first.
 */
export interface SocialIdentity {
  token: string;
  /** Account id when known, for "is this me" checks. */
  userId: string | null;
  name: string;
}

let current: SocialIdentity | null = null;
const listeners = new Set<() => void>();
let tokenProvider: (() => Promise<string | null>) | null = null;

// Earlier builds saved a picked test identity here; signed-in accounts replace it.
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem('chessmate.socialIdentity');
} catch {
  // Storage is optional.
}

export function setSocialIdentity(id: SocialIdentity | null) {
  if (id?.token === current?.token && id?.userId === current?.userId) return;
  current = id;
  for (const l of listeners) l();
}

/** The signed-in account's token source (refreshes when needed); null when signed out. */
export function setSocialTokenProvider(fn: (() => Promise<string | null>) | null) {
  tokenProvider = fn;
}

/** A valid token for the current identity, refreshed if it expired. */
export async function freshSocialToken(): Promise<string | null> {
  if (tokenProvider) {
    try {
      const t = await tokenProvider();
      if (t) return t;
    } catch {
      // Fall back to the last known token.
    }
  }
  return current?.token ?? null;
}

/** For the sign-in flow: act as this account. */
export function setSocialToken(token: string, userId: string, name: string) {
  setSocialIdentity({ token, userId, name });
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
