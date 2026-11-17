import { loadAsync, useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { i18nStore } from '@/i18n/store';

/**
 * ChessMate type families.
 *
 * - Sans (Geist): every piece of UI text.
 * - Display (Montserrat, the ChessMate wordmark face): headlines, titles, the wordmark.
 * - Mono (Geist Mono): clocks, ratings, time controls, overlines. Anything that counts.
 * - Arabic (IBM Plex Sans Arabic): replaces Sans and Display while the app is in Arabic.
 *   Geist and Montserrat have no Arabic glyphs; Plex Arabic shares their clean, geometric
 *   shapes and ships its own Latin, so mixed text (names, "Elo 1500") stays consistent.
 *
 * Custom fonts on native need one family per weight, so a weight is a family name here.
 * Screens never pick these directly: `<Text variant>` does, and plain `fontWeight` styles
 * are mapped to the matching family by `resolveFontStyle`.
 */
export const FONT_FILES = {
  Geist_400Regular: require('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'),
  Geist_500Medium: require('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'),
  Geist_600SemiBold: require('@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'),
  Geist_700Bold: require('@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf'),
  Geist_800ExtraBold: require('@expo-google-fonts/geist/800ExtraBold/Geist_800ExtraBold.ttf'),
  GeistMono_400Regular: require('@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf'),
  GeistMono_500Medium: require('@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf'),
  GeistMono_600SemiBold: require('@expo-google-fonts/geist-mono/600SemiBold/GeistMono_600SemiBold.ttf'),
  GeistMono_700Bold: require('@expo-google-fonts/geist-mono/700Bold/GeistMono_700Bold.ttf'),
  Montserrat_400Regular: require('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf'),
  Montserrat_500Medium: require('@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf'),
  Montserrat_600SemiBold: require('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'),
  Montserrat_700Bold: require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf'),
} as const;

/** Arabic faces. Bundled on native; fetched on web only once someone switches to Arabic. */
export const ARABIC_FONT_FILES = {
  IBMPlexSansArabic_400Regular: require('@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf'),
  IBMPlexSansArabic_500Medium: require('@expo-google-fonts/ibm-plex-sans-arabic/500Medium/IBMPlexSansArabic_500Medium.ttf'),
  IBMPlexSansArabic_600SemiBold: require('@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf'),
  IBMPlexSansArabic_700Bold: require('@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf'),
} as const;

export type FontFamilyName = keyof typeof FONT_FILES | keyof typeof ARABIC_FONT_FILES;

const SANS: Record<number, FontFamilyName> = {
  100: 'Geist_400Regular',
  200: 'Geist_400Regular',
  300: 'Geist_400Regular',
  400: 'Geist_400Regular',
  500: 'Geist_500Medium',
  600: 'Geist_600SemiBold',
  700: 'Geist_700Bold',
  800: 'Geist_800ExtraBold',
  900: 'Geist_800ExtraBold',
};
const MONO: Record<number, FontFamilyName> = {
  100: 'GeistMono_400Regular',
  200: 'GeistMono_400Regular',
  300: 'GeistMono_400Regular',
  400: 'GeistMono_400Regular',
  500: 'GeistMono_500Medium',
  600: 'GeistMono_600SemiBold',
  700: 'GeistMono_700Bold',
  800: 'GeistMono_700Bold',
  900: 'GeistMono_700Bold',
};

const ARABIC: Record<number, FontFamilyName> = {
  400: 'IBMPlexSansArabic_400Regular',
  500: 'IBMPlexSansArabic_500Medium',
  600: 'IBMPlexSansArabic_600SemiBold',
  700: 'IBMPlexSansArabic_700Bold',
};
const arabicFor = (weight: number): FontFamilyName => ARABIC[Math.min(700, Math.max(400, weight))] ?? 'IBMPlexSansArabic_400Regular';

/** Family names by role and weight, for the type tokens. */
export const families = {
  sans: SANS,
  mono: MONO,
  display: {
    400: 'Montserrat_400Regular',
    500: 'Montserrat_500Medium',
    600: 'Montserrat_600SemiBold',
    700: 'Montserrat_700Bold',
  } as Record<400 | 500 | 600 | 700, FontFamilyName>,
};

/** Generic family aliases a style may use instead of a family name. */
export type FontRole = 'sans' | 'mono' | 'display';

const OURS = new Set<string>([...Object.keys(FONT_FILES), ...Object.keys(ARABIC_FONT_FILES)]);
const MONO_HINT = /mono|menlo|courier|consolas/i;

function weightOf(w: TextStyle['fontWeight']): number {
  if (w === 'bold') return 700;
  if (w === undefined || w === 'normal') return 400;
  const n = typeof w === 'number' ? w : parseInt(String(w), 10);
  return Number.isFinite(n) ? Math.round(n / 100) * 100 : 400;
}

const NEUTRAL_WEIGHT: TextStyle = { fontWeight: 'normal' };
const cache = new Map<string, TextStyle>();

/**
 * Maps a style written with `fontWeight` (and optionally the old `fontFamily` stacks or
 * the aliases sans / mono / display) onto the bundled families. Our own family names pass
 * through untouched. Weight is reset to normal so browsers don't fake-bold a bold face.
 *
 * In Arabic, Sans and Display become IBM Plex Sans Arabic of the same weight, and letter
 * spacing is cleared (any tracking breaks the joins between Arabic letters). Mono keeps
 * Geist Mono for digits, with Plex Arabic as the web fallback for any Arabic in it.
 */
export function resolveFontStyle(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const arabic = i18nStore.get().lang === 'ar';
  let fam = flat.fontFamily;
  let weightStyle = flat.fontWeight;
  if (fam && OURS.has(fam)) {
    // One of ours. An explicit weight on top (e.g. a bold caption) picks that weight of the same family.
    const plainWeight = flat.fontWeight === undefined || flat.fontWeight === 'normal';
    if (plainWeight && !arabic) return [style, NEUTRAL_WEIGHT];
    const ownWeight = /_(\d)00/.exec(fam)?.[1];
    fam = fam.startsWith('GeistMono') ? 'mono' : fam.startsWith('Montserrat') ? 'display' : 'sans';
    if (plainWeight && ownWeight) weightStyle = `${ownWeight}00` as TextStyle['fontWeight'];
  }
  const weight = weightOf(weightStyle);
  const italic = flat.fontStyle === 'italic';
  const mono = !!fam && fam !== 'display' && fam !== 'sans' && (fam === 'mono' || MONO_HINT.test(fam));
  let family: FontFamilyName;
  if (mono) family = MONO[weight] ?? 'GeistMono_400Regular';
  else if (arabic) family = arabicFor(weight);
  else if (fam === 'display') family = families.display[Math.min(700, Math.max(400, weight)) as 400 | 500 | 600 | 700] ?? families.display[600];
  else family = SANS[weight] ?? 'Geist_400Regular';
  const key = family + (italic ? 'i' : '') + (arabic ? 'ar' : '');
  let patch = cache.get(key);
  if (!patch) {
    // Web gets Plex Arabic as a per-glyph fallback inside Geist Mono (native falls back to the system).
    const webMonoFallback = arabic && mono && Platform.OS === 'web';
    patch = {
      fontFamily: webMonoFallback ? `${family}, ${arabicFor(weight)}` : family,
      fontWeight: 'normal',
      ...(arabic ? { letterSpacing: 0 } : null),
    };
    cache.set(key, patch);
  }
  return [style, patch];
}

const BASE_FONTS = Platform.OS === 'web' ? FONT_FILES : { ...FONT_FILES, ...ARABIC_FONT_FILES };

/**
 * Loads the bundled families. Render nothing (or the splash) until it returns true.
 * On web the Arabic faces load when the language is Arabic, so other visitors skip them.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(BASE_FONTS);
  useArabicFontsOnSwitch();
  // A failed font load must never block the app: fall back to system fonts.
  return loaded || !!error || (Platform.OS === 'web' && typeof document === 'undefined');
}

let arabicLoad: Promise<void> | null = Platform.OS === 'web' ? null : Promise.resolve();

/** Web: fetch the Arabic faces once. Pass to `initI18n({ beforeReady })` so the first paint waits for them. */
export function loadArabicFonts(): Promise<void> {
  arabicLoad ??= loadAsync(ARABIC_FONT_FILES).catch(() => undefined); // Fall back to the browser's Arabic font.
  return arabicLoad;
}

/** A later switch to Arabic (in Settings) swaps the faces in once they arrive, without blanking the app. */
function useArabicFontsOnSwitch() {
  useEffect(() => {
    if (arabicLoad) return;
    return i18nStore.subscribe(() => {
      if (i18nStore.get().lang === 'ar') void loadArabicFonts();
    });
  }, []);
}
