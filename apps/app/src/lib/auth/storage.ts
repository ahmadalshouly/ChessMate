import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthTokens, AuthUser } from './contract';

/**
 * Session persistence. Native: iOS Keychain / Android Keystore via
 * expo-secure-store. Web: localStorage (there is no secure enclave in the
 * browser; moving the refresh token to an httpOnly cookie is the hardening
 * step once the API is served from the same site).
 */

const KEYS = {
  tokens: 'chessmate.auth.tokens',
  user: 'chessmate.auth.user',
  guest: 'chessmate.auth.guest',
} as const;

const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return webStorage()?.getItem(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Already gone.
  }
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface StoredSession {
  tokens: AuthTokens | null;
  user: AuthUser | null;
  guestName: string | null;
}

export async function loadSession(): Promise<StoredSession> {
  const [tokens, user, guest] = await Promise.all([getItem(KEYS.tokens), getItem(KEYS.user), getItem(KEYS.guest)]);
  return { tokens: parse<AuthTokens>(tokens), user: parse<AuthUser>(user), guestName: guest };
}

export async function saveSignedIn(tokens: AuthTokens, user: AuthUser): Promise<void> {
  await Promise.all([setItem(KEYS.tokens, JSON.stringify(tokens)), setItem(KEYS.user, JSON.stringify(user))]);
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await setItem(KEYS.tokens, JSON.stringify(tokens));
}

export async function saveUser(user: AuthUser): Promise<void> {
  await setItem(KEYS.user, JSON.stringify(user));
}

export async function clearSignedIn(): Promise<void> {
  await Promise.all([deleteItem(KEYS.tokens), deleteItem(KEYS.user)]);
}

export async function saveGuestName(name: string | null): Promise<void> {
  if (name) await setItem(KEYS.guest, name);
  else await deleteItem(KEYS.guest);
}
