import { request } from './api';

/**
 * Bridge to the signed-in session. Sign-in is built in a separate change
 * (useAuth in src/lib/auth); until it lands, development builds act as the
 * seeded "demo" player using the server's dev token so these screens work.
 *
 * After sign-in merges, replace the body of useAccountSession with:
 *   const { status, apiFetch, signOut } = useAuth();
 *   return { signedIn: status === 'signedIn', apiFetch, signOut };
 */
const DEV_TOKEN = __DEV__ ? 'dev:demo:demo' : null;

export interface AccountSession {
  signedIn: boolean;
  apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
  /** Present once real sign-in is wired; the settings screen shows Sign out when it is. */
  signOut?: (opts?: { everywhere?: boolean }) => Promise<void> | void;
}

const devSession: AccountSession = {
  signedIn: DEV_TOKEN !== null,
  apiFetch: (path, init) => request(path, DEV_TOKEN, init),
};

export function useAccountSession(): AccountSession {
  return devSession;
}
