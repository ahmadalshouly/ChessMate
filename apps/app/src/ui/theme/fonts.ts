import { loadAsync, useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { i18nStore } from '@/i18n/store';

/**
 * ChessMate type families (brand card: Playfair Display + Inter).
 *
 * - Display (Playfair Display): headlines, titles, the ChessMate wordmark and the slogan.
 * - Sans (Inter): body text and every piece of UI.
 * - Label (Cinzel): the small all-caps labels (section overlines, greetings, categories
 *   under time controls, tab names). Roman inscription capitals: elegant and timeless.
 * - Mono role (Inter with tabular figures): clocks, ratings, time controls. Anything that
 *   counts keeps fixed-width digits through `fontVariant: ['tabular-nums']`.
 * - Arabic (IBM Plex Sans Arabic): replaces Sans and Display while the app is in Arabic.
 *   Inter and Playfair have no Arabic glyphs; Plex Arabic ships its own Latin, so mixed
 *   text (names, "Elo 1500") stays consistent.
 *
 * Inter, Playfair Display and Cinzel are bundled from assets/fonts (SIL Open Font License,
 * see the licence files there), trimmed to Latin.
 *
 * Custom fonts on native need one family per weight, so a weight is a family name here.
 * Screens never pick these directly: `<Text variant>` does, and plain `fontWeight` styles
 * are mapped to the matching family by `resolveFontStyle`.
 */
export const FONT_FILES = {
  Inter_400Regular: require('../../../assets/fonts/Inter-Regular.otf'),
  Inter_500Medium: require('../../../assets/fonts/Inter-Medium.otf'),
  Inter_600SemiBold: require('../../../assets/fonts/Inter-SemiBold.otf'),
  Inter_700Bold: require('../../../assets/fonts/Inter-Bold.otf'),
  PlayfairDisplay_400Regular: require('../../../assets/fonts/PlayfairDisplay-Regular.ttf'),
  PlayfairDisplay_500Medium: require('../../../assets/fonts/PlayfairDisplay-Medium.ttf'),
  PlayfairDisplay_600SemiBold: require('../../../assets/fonts/PlayfairDisplay-SemiBold.ttf'),
  PlayfairDisplay_700Bold: require('../../../assets/fonts/PlayfairDisplay-Bold.ttf'),
  /** The slogan ("Think. Move. Win.") and the brand line are set in italic. */
  PlayfairDisplay_500MediumItalic: require('../../../assets/fonts/PlayfairDisplay-MediumItalic.ttf'),
  Cinzel_500Medium: require('../../../assets/fonts/Cinzel-Medium.ttf'),
  Cinzel_600SemiBold: require('../../../assets/fonts/Cinzel-SemiBold.ttf'),
  Cinzel_700Bold: require('../../../assets/fonts/Cinzel-Bold.ttf'),
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
  100: 'Inter_400Regular',
  200: 'Inter_400Regular',
  300: 'Inter_400Regular',
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_700Bold',
  900: 'Inter_700Bold',
};
/** Same faces as Sans: the card has two families. Counting text adds tabular figures. */
const MONO: Record<number, FontFamilyName> = SANS;

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
    400: 'PlayfairDisplay_400Regular',
    500: 'PlayfairDisplay_500Medium',
    600: 'PlayfairDisplay_600SemiBold',
    700: 'PlayfairDisplay_700Bold',
  } as Record<400 | 500 | 600 | 700, FontFamilyName>,
  /** The slogan face. */
  displayItalic: 'PlayfairDisplay_500MediumItalic' as FontFamilyName,
  /** All-caps labels. */
  label: {
    500: 'Cinzel_500Medium',
    600: 'Cinzel_600SemiBold',
    700: 'Cinzel_700Bold',
  } as Record<500 | 600 | 700, FontFamilyName>,
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
 * spacing is cleared (any tracking breaks the joins between Arabic letters). Counting text
 * uses Plex Arabic too; its Latin digits keep numbers readable.
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
    // The italic slogan face has no other weights: keep it as it is.
    if (fam === families.displayItalic && !arabic) return [style, NEUTRAL_WEIGHT];
    // Cinzel labels: an explicit weight picks that weight of Cinzel.
    if (fam.startsWith('Cinzel') && !arabic) {
      const w = Math.min(700, Math.max(500, weightOf(flat.fontWeight))) as 500 | 600 | 700;
      return [style, { fontFamily: families.label[w], fontWeight: 'normal' }];
    }
    fam = fam.startsWith('PlayfairDisplay') ? 'display' : 'sans';
    if (plainWeight && ownWeight) weightStyle = `${ownWeight}00` as TextStyle['fontWeight'];
  }
  const weight = weightOf(weightStyle);
  const italic = flat.fontStyle === 'italic';
  const mono = !!fam && fam !== 'display' && fam !== 'sans' && (fam === 'mono' || MONO_HINT.test(fam));
  let family: FontFamilyName;
  if (mono && !arabic) family = MONO[weight] ?? 'Inter_400Regular';
  else if (arabic) family = arabicFor(weight);
  else if (fam === 'display') family = families.display[Math.min(700, Math.max(400, weight)) as 400 | 500 | 600 | 700] ?? families.display[600];
  else family = SANS[weight] ?? 'Inter_400Regular';
  const key = family + (italic ? 'i' : '') + (arabic ? 'ar' : '');
  let patch = cache.get(key);
  if (!patch) {
    patch = {
      fontFamily: family,
      fontWeight: 'normal',
      ...(arabic ? { letterSpacing: 0 } : null),
    };
    cache.set(key, patch);
  }
  // Web gives every text dir="auto", which left-aligns Latin-only text (names, "1+0") in an
  // Arabic layout. A base direction keeps it on the right; an explicit style still wins.
  return arabic && Platform.OS === 'web' ? [WEB_RTL, style, patch] : [style, patch];
}

const WEB_RTL: TextStyle = { writingDirection: 'rtl' };

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
