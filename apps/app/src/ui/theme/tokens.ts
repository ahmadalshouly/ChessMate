import { Platform, type TextStyle } from 'react-native';

import { families } from './fonts';

/**
 * ChessMate design tokens.
 *
 * Brand: monochrome (black and white), casual but professional, frosted glass.
 * Colour is reserved for meaning (success, warning, danger, live) and for the board.
 * Never hard-code a colour, size or font in a screen: read it from `useAppTheme()`.
 */

export type ColorScheme = 'light' | 'dark';

export interface ColorTokens {
  scheme: ColorScheme;
  /** Page background (under the gradient). */
  bg: string;
  /** Two-stop page gradient, top to bottom. */
  bgGradient: readonly [string, string];
  /** Soft glow shapes floating behind glass so the blur has something to catch. */
  bgGlow: readonly [string, string];

  /** Glass fills, from faint to near-opaque. */
  surface: string;
  surfaceStrong: string;
  surfaceSubtle: string;
  /** Opaque surface for places blur cannot be used (Android lists, headers). */
  surfaceSolid: string;
  /** Inset area inside a glass panel (input wells, tab tracks). */
  surfaceSunken: string;
  /** Pressed/hover state over any surface. */
  surfacePressed: string;

  /** 1px edge of glass panels. */
  glassBorder: string;
  /** Bright top edge that sells the glass effect. */
  glassHighlight: string;

  text: string;
  /** Secondary text. Alias kept for older screens. */
  muted: string;
  textTertiary: string;
  textInverse: string;

  /** Primary action fill: black in light mode, white in dark mode. */
  accent: string;
  onAccent: string;

  border: string;
  borderStrong: string;
  focusRing: string;

  /** Dimmed backdrop behind modals and sheets. */
  overlay: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  onDanger: string;
  /** Live / online indicator. */
  live: string;

  skeleton: string;
  skeletonHighlight: string;

  shadow: string;
}

const light: ColorTokens = {
  scheme: 'light',
  bg: '#F3F3F1',
  bgGradient: ['#FAFAF8', '#ECECE9'],
  bgGlow: ['rgba(255, 255, 255, 0.9)', 'rgba(10, 10, 11, 0.035)'],

  surface: 'rgba(255, 255, 255, 0.58)',
  surfaceStrong: 'rgba(255, 255, 255, 0.82)',
  surfaceSubtle: 'rgba(255, 255, 255, 0.34)',
  surfaceSolid: '#FFFFFF',
  surfaceSunken: 'rgba(12, 12, 13, 0.045)',
  surfacePressed: 'rgba(12, 12, 13, 0.06)',

  glassBorder: 'rgba(12, 12, 13, 0.08)',
  glassHighlight: 'rgba(255, 255, 255, 0.95)',

  text: '#0C0C0D',
  muted: '#62626A',
  textTertiary: '#9A9AA1',
  textInverse: '#FFFFFF',

  accent: '#0C0C0D',
  onAccent: '#FAFAF8',

  border: 'rgba(12, 12, 13, 0.08)',
  borderStrong: 'rgba(12, 12, 13, 0.18)',
  focusRing: 'rgba(12, 12, 13, 0.45)',

  overlay: 'rgba(12, 12, 13, 0.32)',

  success: '#1D7A47',
  successSoft: 'rgba(29, 122, 71, 0.10)',
  warning: '#9A6210',
  warningSoft: 'rgba(154, 98, 16, 0.11)',
  danger: '#C2362F',
  dangerSoft: 'rgba(194, 54, 47, 0.09)',
  onDanger: '#FFFFFF',
  live: '#1FA35B',

  skeleton: 'rgba(12, 12, 13, 0.06)',
  skeletonHighlight: 'rgba(12, 12, 13, 0.11)',

  shadow: '#1A1A1C',
};

const dark: ColorTokens = {
  scheme: 'dark',
  bg: '#08080A',
  bgGradient: ['#111114', '#060607'],
  bgGlow: ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.025)'],

  surface: 'rgba(255, 255, 255, 0.045)',
  surfaceStrong: 'rgba(22, 22, 25, 0.82)',
  surfaceSubtle: 'rgba(255, 255, 255, 0.025)',
  surfaceSolid: '#131316',
  surfaceSunken: 'rgba(0, 0, 0, 0.35)',
  surfacePressed: 'rgba(255, 255, 255, 0.07)',

  glassBorder: 'rgba(255, 255, 255, 0.085)',
  glassHighlight: 'rgba(255, 255, 255, 0.16)',

  text: '#F2F2F0',
  muted: '#9A9AA0',
  textTertiary: '#64646B',
  textInverse: '#0A0A0B',

  accent: '#F2F2F0',
  onAccent: '#0A0A0B',

  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  focusRing: 'rgba(255, 255, 255, 0.5)',

  overlay: 'rgba(0, 0, 0, 0.6)',

  success: '#4ADE94',
  successSoft: 'rgba(74, 222, 148, 0.10)',
  warning: '#F2B74F',
  warningSoft: 'rgba(242, 183, 79, 0.11)',
  danger: '#FF6B61',
  dangerSoft: 'rgba(255, 107, 97, 0.10)',
  onDanger: '#FFFFFF',
  live: '#4ADE94',

  skeleton: 'rgba(255, 255, 255, 0.05)',
  skeletonHighlight: 'rgba(255, 255, 255, 0.10)',

  shadow: '#000000',
};

export const colors = { light, dark } as const;

/** Spacing scale (4pt grid). Use for padding, margins and gaps. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  giant: 64,
} as const;
export type Space = keyof typeof space;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;
export type Radius = keyof typeof radii;

/** BlurView intensity per glass strength. Android renders tint only (no native blur). */
export const blur = {
  subtle: 20,
  regular: 40,
  strong: 70,
} as const;
export type GlassStrength = keyof typeof blur;

export const motion = {
  fast: 120,
  normal: 220,
  slow: 360,
  /** Spring for presses and selection changes (Reanimated `withSpring`). */
  spring: { damping: 18, stiffness: 260, mass: 0.7 },
} as const;

export const layout = {
  /** Readable column width for content screens on tablets and desktop web. */
  maxContentWidth: 720,
  /** Wide layouts (board + side panel). */
  maxWideWidth: 1200,
  /** Minimum touch target. */
  hitSize: 44,
} as const;

const S = families.sans;
const M = families.mono;

/** Family names for places that style text by hand. */
export const fonts = {
  sans: S[400],
  sansMedium: S[500],
  sansSemiBold: S[600],
  sansBold: S[700],
  mono: M[400],
  monoMedium: M[500],
  monoBold: M[600],
  display: families.display[600],
  displayMedium: families.display[500],
  displayRegular: families.display[400],
} as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily' | 'textTransform' | 'fontVariant' | 'fontStyle'>;

/**
 * Type ramp. Use through `<Text variant="…">`.
 *
 * Three voices: Montserrat (the wordmark face) for big moments, sans for everything you read,
 * mono for anything that counts or labels (ratings, clocks, overlines).
 */
export const typography = {
  /** Hero headline. One per screen at most. */
  display: { fontFamily: families.display[600], fontSize: 38, lineHeight: 44, letterSpacing: -1.4 },
  /** Screen title. */
  title: { fontFamily: families.display[600], fontSize: 28, lineHeight: 34, letterSpacing: -0.9 },
  heading: { fontFamily: families.display[600], fontSize: 18, lineHeight: 24, letterSpacing: -0.4 },
  subheading: { fontFamily: S[600], fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  body: { fontFamily: S[400], fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: S[500], fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  label: { fontFamily: S[500], fontSize: 13, lineHeight: 18, letterSpacing: -0.05 },
  caption: { fontFamily: S[400], fontSize: 12.5, lineHeight: 17 },
  /** Small uppercase mono label above sections and stats. */
  overline: { fontFamily: M[500], fontSize: 10.5, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' },
  /** Ratings, counts, evaluations: fixed-width digits. */
  numeric: { fontFamily: M[500], fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  /** Big figures in stat blocks and time-control tiles. */
  figure: { fontFamily: M[500], fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  clock: { fontFamily: M[600], fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  mono: { fontFamily: M[400], fontSize: 13, lineHeight: 19 },
} as const satisfies Record<string, TypeStyle>;
export type TextVariant = keyof typeof typography;

export function shadows(c: ColorTokens) {
  const k = c.scheme === 'dark' ? 3 : 1;
  // Android draws `elevation` as a solid shadow under the whole box, which shows through any
  // translucent fill as a grey slab. Glass there leans on the hairline edge instead.
  const android = Platform.OS === 'android';
  return {
    none: {},
    sm: { shadowColor: c.shadow, shadowOpacity: 0.04 * k, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: android ? 0 : 1 },
    md: { shadowColor: c.shadow, shadowOpacity: 0.06 * k, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: android ? 0 : 3 },
    lg: { shadowColor: c.shadow, shadowOpacity: 0.1 * k, shadowRadius: 48, shadowOffset: { width: 0, height: 22 }, elevation: android ? 2 : 8 },
  } as const;
}
export type Elevation = keyof ReturnType<typeof shadows>;

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  space: typeof space;
  radii: typeof radii;
  blur: typeof blur;
  motion: typeof motion;
  layout: typeof layout;
  fonts: typeof fonts;
  typography: typeof typography;
  shadows: ReturnType<typeof shadows>;
}

/**
 * Android has no backdrop blur, so a translucent panel shows whatever sits under it
 * (the board, other cards) instead of frosting it. There, glass fills are near-opaque
 * frosted tones: still layered and glassy against the backdrop, never see-through.
 */
const androidGlass: Record<ColorScheme, Partial<ColorTokens>> = {
  light: {
    surface: 'rgba(255, 255, 255, 0.94)',
    surfaceStrong: '#FFFFFF',
    surfaceSubtle: 'rgba(255, 255, 255, 0.86)',
  },
  dark: {
    surface: 'rgba(24, 24, 27, 0.94)',
    surfaceStrong: '#18181B',
    surfaceSubtle: 'rgba(20, 20, 23, 0.9)',
  },
};

export function makeTheme(scheme: ColorScheme): Theme {
  const c = Platform.OS === 'android' ? { ...colors[scheme], ...androidGlass[scheme] } : colors[scheme];
  return { scheme, colors: c, space, radii, blur, motion, layout, fonts, typography, shadows: shadows(c) };
}

export const themes = { light: makeTheme('light'), dark: makeTheme('dark') } as const;
