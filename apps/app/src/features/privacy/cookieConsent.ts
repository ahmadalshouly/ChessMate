import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Cookie and storage consent (GDPR, ePrivacy / TTDSG § 25).
 *
 * ChessMate itself only stores what the app needs to work (sign-in, language,
 * settings, saved reviews): that is "necessary" and needs no consent. Two
 * categories are optional and off until the visitor allows them:
 * - analytics: Google Analytics (GA4 on the web, Firebase Analytics in the
 *   apps) and ChessMate's own usage statistics (src/lib/analytics);
 * - external media: live-stream players from Twitch, YouTube and Kick, which
 *   set their own cookies (web only).
 *
 * The choice is kept on this device (it applies before anyone signs in) and can
 * be changed at any time under Settings → Privacy or on the cookie policy page.
 * Bump CONSENT_VERSION when a new optional category is added, so everyone is asked again.
 */
export const CONSENT_VERSION = 2;
// The key stays the same across versions: the stored version decides whether to ask again.
const KEY = 'chessmate.cookieConsent.v1';

export interface CookieConsent {
  /** False until the visitor has made a choice (the banner shows on the web). */
  decided: boolean;
  /** Twitch, YouTube and Kick players embedded in the page. */
  externalMedia: boolean;
  /** Google Analytics / Firebase Analytics and ChessMate's own usage statistics. */
  analytics: boolean;
  decidedAt: number | null;
}

const UNDECIDED: CookieConsent = { decided: false, externalMedia: false, analytics: false, decidedAt: null };
let current: CookieConsent = readLocal();
const listeners = new Set<() => void>();

function parse(raw: string | null | undefined): CookieConsent {
  if (!raw) return UNDECIDED;
  try {
    const v = JSON.parse(raw) as { version?: number; externalMedia?: unknown; analytics?: unknown; decidedAt?: unknown };
    // An older choice (before analytics was a category) is asked again, keeping what it allowed.
    if (v.version !== CONSENT_VERSION) return { ...UNDECIDED, externalMedia: v.externalMedia === true };
    return { decided: true, externalMedia: v.externalMedia === true, analytics: v.analytics === true, decidedAt: typeof v.decidedAt === 'number' ? v.decidedAt : null };
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

/** The apps read the choice asynchronously; the banner waits for it so it never flashes. */
let loaded = Platform.OS === 'web';
export const cookieConsentLoaded = () => loaded;

if (Platform.OS !== 'web') {
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const stored = parse(raw);
      loaded = true;
      emit(current.decided ? { ...current } : stored);
    })
    .catch(() => {
      loaded = true;
      emit({ ...current });
    });
}

function emit(next: CookieConsent) {
  current = next;
  listeners.forEach((l) => l());
}

/** Runs `fn` on every change of the choice (outside React). Returns the unsubscribe. */
export function onCookieConsentChange(fn: (c: CookieConsent) => void): () => void {
  const l = () => fn(current);
  listeners.add(l);
  return () => void listeners.delete(l);
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

/**
 * Saves the visitor's choice. Withdrawing is as easy as giving it: call again with false.
 * A category left out keeps its current value.
 */
export function setCookieConsent(choice: { externalMedia?: boolean; analytics?: boolean }, now = Date.now()) {
  const next: CookieConsent = {
    decided: true,
    externalMedia: choice.externalMedia ?? current.externalMedia,
    analytics: choice.analytics ?? current.analytics,
    decidedAt: now,
  };
  const raw = JSON.stringify({ version: CONSENT_VERSION, externalMedia: next.externalMedia, analytics: next.analytics, decidedAt: now });
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
