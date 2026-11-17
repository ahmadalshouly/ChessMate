import { useMemo } from 'react';

import { useAuth } from '@/lib/auth';

import { request } from './api';

/** The signed-in session as the profile and settings screens use it. */
export interface AccountSession {
  signedIn: boolean;
  apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
  /** The settings screen shows Sign out when present. */
  signOut?: (opts?: { everywhere?: boolean }) => Promise<void> | void;
}

/** Profile and settings calls go out with the signed-in player's access token (refreshed as needed). */
export function useAccountSession(): AccountSession {
  const { status, getAccessToken, signOut } = useAuth();
  const signedIn = status === 'signedIn';
  return useMemo(
    () => ({
      signedIn,
      apiFetch: async <T,>(path: string, init?: { method?: string; body?: unknown }) => request<T>(path, signedIn ? await getAccessToken() : null, init),
      signOut: signedIn ? signOut : undefined,
    }),
    [signedIn, getAccessToken, signOut],
  );
}
