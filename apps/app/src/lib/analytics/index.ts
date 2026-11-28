import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyticsScreenName, type AnalyticsBatch, type AnalyticsEventInput, type AnalyticsEventName, type AnalyticsProps } from '@chessmate/core';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';

import { getCookieConsent, onCookieConsentChange } from '@/features/privacy/cookieConsent';
import { i18nStore } from '@/i18n/store';
import { API_URL } from '@/lib/config';

import { googleConfigured, googleEvent, googleName, googleScreen, googleSetEnabled, googleUser } from './google';

/**
 * One analytics layer for the whole app.
 *
 *   track('game_start', { category: 'blitz', rated: true })
 *
 * Every event goes to two places, and only after the player allowed analytics
 * (cookie consent, category "analytics"); before that, calls do nothing and
 * nothing is stored on the device:
 * - Google Analytics: GA4 on the web, Firebase Analytics in the apps (./google).
 * - ChessMate's own server (POST /api/events), for Admin → Analytics.
 *
 * Event names and props are the closed set in @chessmate/core
 * (ANALYTICS_EVENTS): no ids, no names, no free text. Screens are sent as
 * route patterns (`/game/[id]`). Events are batched and sent every few
 * seconds, so tracking never costs a request per tap and never re-renders
 * anything (this is plain module state, no React context).
 */

const DEVICE_KEY = 'chessmate.analytics.device';
const FLUSH_MS = 8_000;
const MAX_QUEUE = 200;
const BATCH = 40;
/** A visit ends after this long in the background; coming back starts a new session. */
const SESSION_GAP_MS = 30 * 60_000;

const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
const appVersion = Constants.expoConfig?.version;

let enabled = false;
let deviceId: string | null = null;
let sessionId = randomUUID();
let queue: AnalyticsEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let currentScreen: string | undefined;
let userId: string | null = null;
let tokenProvider: (() => Promise<string | null>) | null = null;
let backgroundAt: number | null = null;
let started = false;

/** True when the player allowed analytics (whether or not Google is configured in this build). */
export const analyticsEnabled = () => enabled;
/** "Google Analytics 4 (G-…)", "Firebase Analytics", or null when this build has no Google Analytics. */
export const analyticsGoogleName = () => googleName();

/** Records one event. Does nothing until the player allowed analytics. */
export function track(name: AnalyticsEventName, props?: AnalyticsProps) {
  if (!enabled) return;
  enqueue({ name, at: Date.now(), ...(currentScreen ? { screen: currentScreen } : null), ...(props ? { props } : null) });
  googleEvent(name, props);
}

/** Records a screen from Expo Router's segments (see useAnalyticsScreens). */
export function trackScreen(segments: readonly string[]) {
  const screen = analyticsScreenName(segments);
  if (screen === currentScreen) return;
  currentScreen = screen;
  if (!enabled) return;
  enqueue({ name: 'screen_view', at: Date.now(), screen });
  googleScreen(screen);
}

/** The signed-in account (null for guests). Google gets our internal account id, never an email or name. */
export function setAnalyticsUser(id: string | null, getToken: (() => Promise<string | null>) | null) {
  tokenProvider = getToken;
  if (id === userId) return;
  userId = id;
  googleUser(id);
}

function enqueue(e: AnalyticsEventInput) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(e);
  if (queue.length >= BATCH) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
}

async function flush(opts: { keepalive?: boolean } = {}) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!enabled || !deviceId || queue.length === 0) return;
  const events = queue.splice(0, BATCH);
  const body: AnalyticsBatch = { deviceId, sessionId, platform, appVersion, lang: i18nStore.get().lang, events };
  try {
    const token = tokenProvider ? await tokenProvider().catch(() => null) : null;
    await fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : null) },
      body: JSON.stringify(body),
      // Lets the last batch leave when a browser tab closes.
      ...(opts.keepalive ? { keepalive: true } : null),
    });
  } catch {
    // Offline or server away: these are statistics, not data anyone needs. Drop the batch.
  }
  if (queue.length) timer = setTimeout(() => void flush(), FLUSH_MS);
}

async function deviceIdOrNew(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
  if (stored) return stored;
  const id = randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => undefined);
  return id;
}

function appOpen() {
  track('app_open', { lang: i18nStore.get().lang });
  if (currentScreen) {
    enqueue({ name: 'screen_view', at: Date.now(), screen: currentScreen });
    googleScreen(currentScreen);
  }
}

async function apply(allowed: boolean) {
  if (allowed === enabled) return;
  if (allowed) {
    deviceId = await deviceIdOrNew();
    enabled = true;
    googleSetEnabled(true);
    googleUser(userId);
    appOpen();
    return;
  }
  // Withdrawn: stop at once, forget this device on our server, and delete its id here.
  enabled = false;
  queue = [];
  googleSetEnabled(false);
  const id = deviceId;
  deviceId = null;
  await AsyncStorage.removeItem(DEVICE_KEY).catch(() => undefined);
  if (id) {
    void fetch(`${API_URL}/api/events/forget`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: id }) }).catch(
      () => undefined,
    );
  }
}

/** Starts listening to the consent choice and the app's lifecycle. Called once from the root layout. */
export function startAnalytics() {
  if (started) return;
  started = true;
  void apply(getCookieConsent().analytics);
  onCookieConsentChange((c) => void apply(c.analytics));
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (backgroundAt !== null && Date.now() - backgroundAt > SESSION_GAP_MS) {
        sessionId = randomUUID();
        if (enabled) appOpen();
      }
      backgroundAt = null;
    } else if (state === 'background' || state === 'inactive') {
      backgroundAt ??= Date.now();
      void flush({ keepalive: true });
    }
  });
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush({ keepalive: true });
    });
  }
}

export { googleConfigured as analyticsGoogleConfigured };
