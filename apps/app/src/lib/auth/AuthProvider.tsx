import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiError, authApi, request } from './client';
import type { AuthResponse, AuthTokens, AuthUser } from './contract';
import * as storage from './storage';

export type AuthStatus = 'loading' | 'signedIn' | 'guest' | 'signedOut';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  guestName: string | null;
  signIn(login: string, password: string): Promise<void>;
  signUp(input: { username: string; email: string; password: string }): Promise<void>;
  signOut(opts?: { everywhere?: boolean }): Promise<void>;
  continueAsGuest(): Promise<void>;
  /** A valid access token, refreshed if needed; null for guests or when signed out. */
  getAccessToken(): Promise<string | null>;
  /** Authenticated JSON request against API_URL; refreshes and retries once on 401. */
  apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
  /** Re-reads the user from the server, e.g. after a profile edit. */
  refreshUser(): Promise<void>;
  /** Token for the game server's hello: access token, or "guest:<name>". */
  getGameToken(): Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Refresh slightly before expiry so a request never leaves with a dead token. */
const EXPIRY_SKEW_MS = 30_000;

function newGuestName(): string {
  return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const tokens = useRef<AuthTokens | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const becomeSignedOut = useCallback(async () => {
    tokens.current = null;
    await storage.clearSignedIn();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const acceptSession = useCallback(async ({ user: u, tokens: t }: AuthResponse) => {
    tokens.current = t;
    await storage.saveSignedIn(t, u);
    await storage.saveGuestName(null);
    setGuestName(null);
    setUser(u);
    setStatus('signedIn');
  }, []);

  /** Single-flight refresh: concurrent callers share one request so a rotated token is never reused. */
  const refresh = useCallback((): Promise<string | null> => {
    if (refreshing.current) return refreshing.current;
    const current = tokens.current;
    if (!current) return Promise.resolve(null);
    const p = (async () => {
      try {
        const res = await authApi.refresh(current.refreshToken);
        tokens.current = res.tokens;
        await storage.saveSignedIn(res.tokens, res.user);
        setUser(res.user);
        return res.tokens.accessToken;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === 'invalid_token')) {
          await becomeSignedOut();
          return null;
        }
        // Offline or server hiccup: keep the session and let the caller try the old token.
        return tokens.current?.accessToken ?? null;
      } finally {
        refreshing.current = null;
      }
    })();
    refreshing.current = p;
    return p;
  }, [becomeSignedOut]);

  const getAccessToken = useCallback(async () => {
    const t = tokens.current;
    if (!t) return null;
    if (t.accessExpiresAt - EXPIRY_SKEW_MS > Date.now()) return t.accessToken;
    return refresh();
  }, [refresh]);

  const apiFetch = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getAccessToken();
      try {
        return await request<T>(path, { ...init, token });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401 || !tokens.current) throw e;
        const fresh = await refresh();
        if (!fresh) throw e;
        return request<T>(path, { ...init, token: fresh });
      }
    },
    [getAccessToken, refresh],
  );

  const refreshUser = useCallback(async () => {
    if (!tokens.current) return;
    const { user: u } = await apiFetch<{ user: AuthUser }>('/api/auth/me');
    await storage.saveUser(u);
    setUser(u);
  }, [apiFetch]);

  // Restore the saved session. Signed-in users get in immediately (works offline); the user is re-validated in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storage.loadSession();
      if (cancelled) return;
      if (saved.tokens && saved.user) {
        tokens.current = saved.tokens;
        setUser(saved.user);
        setStatus('signedIn');
        refreshUser().catch(() => {});
      } else if (saved.guestName) {
        setGuestName(saved.guestName);
        setStatus('guest');
      } else {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const signIn = useCallback(
    async (login: string, password: string) => acceptSession(await authApi.login({ login: login.trim(), password })),
    [acceptSession],
  );

  const signUp = useCallback(
    async (input: { username: string; email: string; password: string }) =>
      acceptSession(await authApi.signUp({ username: input.username.trim(), email: input.email.trim(), password: input.password })),
    [acceptSession],
  );

  const signOut = useCallback(
    async (opts?: { everywhere?: boolean }) => {
      const t = tokens.current;
      if (t) authApi.logout(t.refreshToken, !!opts?.everywhere).catch(() => {});
      await becomeSignedOut();
    },
    [becomeSignedOut],
  );

  const continueAsGuest = useCallback(async () => {
    const name = guestName ?? newGuestName();
    await storage.saveGuestName(name);
    setGuestName(name);
    setStatus('guest');
  }, [guestName]);

  const getGameToken = useCallback(async () => {
    const access = await getAccessToken();
    if (access) return access;
    let name = guestName;
    if (!name) {
      name = newGuestName();
      await storage.saveGuestName(name);
      setGuestName(name);
    }
    return `guest:${name}`;
  }, [getAccessToken, guestName]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, guestName, signIn, signUp, signOut, continueAsGuest, getAccessToken, apiFetch, refreshUser, getGameToken }),
    [status, user, guestName, signIn, signUp, signOut, continueAsGuest, getAccessToken, apiFetch, refreshUser, getGameToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
