import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Cookie and storage consent (GDPR, ePrivacy / TTDSG § 25).
 *
 * ChessMate itself only stores what the app needs to work (sign-in, language,
 * settings, saved reviews): that is "necessary" and needs no consent. The one
 * optional category is external media: live-stream players from Twitch, YouTube
 * and Kick, which set their own cookies. Those load only after consent.
 *
 * The choice is kept on this device (it applies before anyone signs in) and can
 * be changed at any time under Settings → Privacy or on the cookie policy page.
 * Bump CONSENT_VERSION when a new optional category is added, so everyone is asked again.
 */
export const CONSENT_VERSION = 1;
const KEY = 'chessmate.cookieConsent.v1';

export interface CookieConsent {
  /** False until the visitor has made a choice (the banner shows on the web). */
  decided: boolean;
  /** Twitch, YouTube and Kick players embedded in the page. */
  externalMedia: boolean;
  decidedAt: number | null;
}

const UNDECIDED: CookieConsent = { decided: false, externalMedia: false, decidedAt: null };
let current: CookieConsent = readLocal();
const listeners = new Set<() => void>();

function parse(raw: string | null | undefined): CookieConsent {
  if (!raw) return UNDECIDED;
  try {
    const v = JSON.parse(raw) as { version?: number; externalMedia?: unknown; decidedAt?: unknown };
    if (v.version !== CONSENT_VERSION) return UNDECIDED;
    return { decided: true, externalMedia: v.externalMedia === true, decidedAt: typeof v.decidedAt === 'number' ? v.decidedAt : null };
  } catch {
    return UNDECIDED;
  }
}

function readLocal(): CookieConsent {
  if (Platform.OS !== 'web') return UNDECIDED;
  try {
    return parse(globalThis.localStorage?.getItem(KEY));
  } catch {
    return UNDECIDED;
  }
}

if (Platform.OS !== 'web') {
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const stored = parse(raw);
      if (stored.decided && !current.decided) emit(stored);
    })
    .catch(() => undefined);
}

function emit(next: CookieConsent) {
  current = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getCookieConsent(): CookieConsent {
  return current;
}

export function useCookieConsent(): CookieConsent {
  return useSyncExternalStore(subscribe, getCookieConsent, getCookieConsent);
}

/** Saves the visitor's choice. Withdrawing is as easy as giving it: call again with false. */
export function setCookieConsent(choice: { externalMedia: boolean }, now = Date.now()) {
  const next: CookieConsent = { decided: true, externalMedia: choice.externalMedia, decidedAt: now };
  const raw = JSON.stringify({ version: CONSENT_VERSION, externalMedia: next.externalMedia, decidedAt: now });
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(KEY, raw);
    } catch {
      // Storage can be unavailable (private mode); the choice holds for this visit.
    }
  } else {
    AsyncStorage.setItem(KEY, raw).catch(() => undefined);
  }
  emit(next);
}
