import { useCallback, useSyncExternalStore } from 'react';

import { hasMessage, resolve, type KeyPath, type Lang, type Params } from './core';
import { ar } from './locales/ar';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { tr } from './locales/tr';
import { id } from './locales/id';
import { hi } from './locales/hi';
import { zh } from './locales/zh';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { i18nStore, isRTL } from './store';

export { LANGS, SYSTEM_FONT_LANGS, type Lang } from './core';
export { deviceLanguage, initI18n, needsRestartFor, refreshSystemLanguage, setLanguagePreference, type LanguagePreference } from './store';

const dicts = { en, ar, de, es, fr, pt, ru, tr, id, hi, zh, ja, ko };

/** Every translation key, e.g. `'settings.language.title'`. */
export type TKey = KeyPath<typeof en>;
export type TFunction = (key: TKey, params?: Params) => string;

/** Language names in their own language, for the picker. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  ar: 'العربية',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  ru: 'Русский',
  tr: 'Türkçe',
  id: 'Bahasa Indonesia',
  hi: 'हिन्दी',
  zh: '简体中文',
  ja: '日本語',
  ko: '한국어',
};

/** Country whose flag stands for each language in the picker. */
export const LANGUAGE_FLAG_COUNTRY: Record<Lang, string> = {
  en: 'GB',
  ar: 'SA',
  de: 'DE',
  es: 'ES',
  fr: 'FR',
  pt: 'BR',
  ru: 'RU',
  tr: 'TR',
  id: 'ID',
  hi: 'IN',
  zh: 'CN',
  ja: 'JP',
  ko: 'KR',
};

/**
 * BCP 47 tag for Intl/Date formatting. Arabic and Hindi keep Western digits, as ratings
 * and clocks use them.
 */
const LOCALE_TAGS: Record<Lang, string> = {
  en: 'en-US',
  ar: 'ar-u-nu-latn',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
  ru: 'ru-RU',
  tr: 'tr-TR',
  id: 'id-ID',
  hi: 'hi-IN-u-nu-latn',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
};
export function localeTag(lang: Lang = i18nStore.get().lang): string {
  return LOCALE_TAGS[lang];
}

/** Translate outside React (module code, callbacks). Prefer `useT()` in components so they re-render. */
export function translate(key: TKey, params?: Params): string {
  return resolve(i18nStore.get().lang, dicts, key, params);
}

/** Current language and direction. Re-renders when the language changes. */
export function useI18n() {
  const s = useSyncExternalStore(i18nStore.subscribe, i18nStore.get, i18nStore.get);
  const tr = useCallback<TFunction>((key, params) => resolve(s.lang, dicts, key, params), [s.lang]);
  return { tr, lang: s.lang, preference: s.preference, ready: s.ready, rtl: isRTL(s.lang), locale: localeTag(s.lang) };
}

/**
 * The translator for components:
 *
 *   const tr = useT();
 *   <Text>{tr('nav.play')}</Text>
 *   <Text>{tr('leaderboard.games', { count: 12 })}</Text>
 *
 * (Named `tr` because `t` is the theme in most screens.)
 */
export function useT(): TFunction {
  return useI18n().tr;
}

/**
 * Translate a key built at runtime (e.g. from server data), or return `fallback` when
 * no language has it. Use for open-ended ids like puzzle themes or report reasons.
 */
export function translateOr(key: string, fallback: string, params?: Params): string {
  const lang = i18nStore.get().lang;
  return hasMessage(lang, dicts, key) ? resolve(lang, dicts, key, params) : fallback;
}

export function formatDate(ms: number | Date, options?: Intl.DateTimeFormatOptions, lang?: Lang): string {
  const d = typeof ms === 'number' ? new Date(ms) : ms;
  try {
    return d.toLocaleDateString(localeTag(lang), options);
  } catch {
    return d.toLocaleDateString(undefined, options);
  }
}

export function formatDateTime(ms: number, lang?: Lang): string {
  try {
    return new Date(ms).toLocaleString(localeTag(lang));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function formatNumber(n: number, lang?: Lang): string {
  try {
    return n.toLocaleString(localeTag(lang));
  } catch {
    return String(n);
  }
}

/** "5m ago" style relative time, falling back to a date after a month. */
export function formatAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return translate('common.time.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return translate('common.time.minutesAgo', { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return translate('common.time.hoursAgo', { count: h });
  const d = Math.round(h / 24);
  if (d < 30) return translate('common.time.daysAgo', { count: d });
  return formatDate(ms, { day: 'numeric', month: 'short', year: 'numeric' });
}

const MIRRORED: Record<string, string> = {
  'arrow-forward': 'arrow-back',
  'arrow-back': 'arrow-forward',
  'chevron-forward': 'chevron-back',
  'chevron-back': 'chevron-forward',
  'caret-forward': 'caret-back',
  'caret-back': 'caret-forward',
  'chevron-left': 'chevron-right',
  'chevron-right': 'chevron-left',
  'page-first': 'page-last',
  'page-last': 'page-first',
};

/** Direction-aware icon name (Ionicons or MaterialCommunityIcons): "forward" arrows point left in Arabic. Leaves other icons alone. */
export function dirIcon<T extends string>(name: T): T {
  return (isRTL(i18nStore.get().lang) ? (MIRRORED[name] ?? name) : name) as T;
}
