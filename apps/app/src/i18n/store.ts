import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import { I18nManager, Platform } from 'react-native';

import { LANGS, RTL_LANGS, type Lang } from './core';

/** What the user picked in Settings. `system` follows the device language. */
export type LanguagePreference = 'system' | Lang;

const KEY = 'chessmate.language';
const RELOAD_KEY = 'chessmate.language.rtlReload';

interface State {
  preference: LanguagePreference;
  lang: Lang;
  ready: boolean;
}

/** First supported language in the device's preference list, else English. */
export function deviceLanguage(): Lang {
  try {
    for (const l of getLocales()) {
      const code = (l.languageCode ?? l.languageTag.split('-')[0] ?? '').toLowerCase();
      if ((LANGS as readonly string[]).includes(code)) return code as Lang;
    }
  } catch {
    // Locale APIs can be missing in tests or very old browsers.
  }
  return 'en';
}

const isPreference = (v: unknown): v is LanguagePreference => v === 'system' || (LANGS as readonly unknown[]).includes(v);
const resolveLang = (p: LanguagePreference): Lang => (p === 'system' ? deviceLanguage() : p);

function readWebPreference(): LanguagePreference | null {
  if (Platform.OS !== 'web') return null;
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return isPreference(v) ? v : null;
  } catch {
    return null;
  }
}

// Web reads storage synchronously so the first paint is already in the right language.
const webInitial = readWebPreference();
let state: State = {
  preference: webInitial ?? 'system',
  lang: resolveLang(webInitial ?? 'system'),
  ready: Platform.OS === 'web',
};
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export const i18nStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export const isRTL = (lang: Lang) => RTL_LANGS.has(lang);

/** Web: mirror the document and tell the browser (and screen readers) the language. */
function applyWebDocument(lang: Lang) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = isRTL(lang) ? 'rtl' : 'ltr';
  if (isRTL(lang) && !document.getElementById('chessmate-arabic-font')) {
    // Brand sans has no Arabic glyphs; IBM Plex Sans Arabic matches its clean, geometric feel.
    const link = document.createElement('link');
    link.id = 'chessmate-arabic-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }
}

/**
 * Native: React Native mirrors layout at launch, so a direction change needs a restart.
 * Returns true when a reload was started. A guard stops a reload loop if the platform
 * refuses the change (for example a host app that never allows RTL).
 */
async function applyNativeDirection(lang: Lang): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const rtl = isRTL(lang);
  if (I18nManager.isRTL === rtl) {
    await AsyncStorage.removeItem(RELOAD_KEY).catch(() => undefined);
    return false;
  }
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  const target = rtl ? 'rtl' : 'ltr';
  const last = await AsyncStorage.getItem(RELOAD_KEY).catch(() => null);
  if (last === target) return false; // Already reloaded once for this and it did not stick.
  await AsyncStorage.setItem(RELOAD_KEY, target).catch(() => undefined);
  try {
    await reloadAppAsync('Switch layout direction for the new language');
    return true;
  } catch {
    return false;
  }
}

/** Load the saved choice and apply direction. Called once from the root layout. */
export async function initI18n(): Promise<void> {
  let preference = state.preference;
  if (Platform.OS !== 'web') {
    const saved = await AsyncStorage.getItem(KEY).catch(() => null);
    if (isPreference(saved)) preference = saved;
  }
  const lang = resolveLang(preference);
  applyWebDocument(lang);
  const reloading = await applyNativeDirection(lang);
  if (!reloading) emit({ preference, lang, ready: true });
}

/** Change language. On native, switching between LTR and RTL restarts the app once. */
export async function setLanguagePreference(preference: LanguagePreference): Promise<void> {
  const lang = resolveLang(preference);
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(KEY, preference);
    } catch {
      // Private mode: the choice still applies for this visit.
    }
  } else {
    await AsyncStorage.setItem(KEY, preference).catch(() => undefined);
  }
  applyWebDocument(lang);
  emit({ ...state, preference, lang });
  await applyNativeDirection(lang);
}

/** Re-check the device language (e.g. after the OS setting changed) when following the system. */
export function refreshSystemLanguage() {
  if (state.preference !== 'system') return;
  const lang = deviceLanguage();
  if (lang === state.lang) return;
  applyWebDocument(lang);
  emit({ ...state, lang });
  void applyNativeDirection(lang);
}

/** True when switching to this language will restart the app (native direction change). */
export function needsRestartFor(preference: LanguagePreference): boolean {
  return Platform.OS !== 'web' && isRTL(resolveLang(preference)) !== I18nManager.isRTL;
}
