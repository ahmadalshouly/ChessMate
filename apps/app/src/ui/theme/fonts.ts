import { useFonts } from 'expo-font';
import { Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

/**
 * ChessMate type families.
 *
 * - Sans (Geist): every piece of UI text.
 * - Display (Montserrat, the ChessMate wordmark face): headlines, titles, the wordmark.
 * - Mono (Geist Mono): clocks, ratings, time controls, overlines. Anything that counts.
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

export type FontFamilyName = keyof typeof FONT_FILES;

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

const OURS = new Set<string>(Object.keys(FONT_FILES));
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
 */
export function resolveFontStyle(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  let fam = flat.fontFamily;
  if (fam && OURS.has(fam)) {
    // One of ours. An explicit weight on top (e.g. a bold caption) picks that weight of the same family.
    if (flat.fontWeight === undefined || flat.fontWeight === 'normal') return [style, NEUTRAL_WEIGHT];
    fam = fam.startsWith('GeistMono') ? 'mono' : fam.startsWith('Montserrat') ? 'display' : 'sans';
  }
  const weight = weightOf(flat.fontWeight);
  const italic = flat.fontStyle === 'italic';
  let family: FontFamilyName;
  if (fam === 'display') family = families.display[Math.min(700, Math.max(400, weight)) as 400 | 500 | 600 | 700] ?? families.display[600];
  else if (fam && (fam === 'mono' || MONO_HINT.test(fam))) family = MONO[weight] ?? 'GeistMono_400Regular';
  else family = SANS[weight] ?? 'Geist_400Regular';
  const key = family + (italic ? 'i' : '');
  let patch = cache.get(key);
  if (!patch) {
    patch = { fontFamily: family, fontWeight: 'normal' };
    cache.set(key, patch);
  }
  return [style, patch];
}

/** Loads the bundled families. Render nothing (or the splash) until it returns true. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_FILES);
  // A failed font load must never block the app: fall back to system fonts.
  return loaded || !!error || Platform.OS === 'web' && typeof document === 'undefined';
}
