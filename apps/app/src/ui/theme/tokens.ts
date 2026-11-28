import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { families } from './fonts';

/**
 * ChessMate design tokens.
 *
 * Brand: monochrome (black and white), casual but professional, liquid glass: translucent
 * layers that blur and brighten what is behind them, specular rims instead of heavy
 * borders, generous rounding, and chrome that floats above the content.
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
  /** Specular rim drawn inside glass edges: light catching the top, a softer bounce at the bottom. */
  glassRimTop: string;
  glassRimBottom: string;
  /** Fill of floating chrome (tab bar, header capsules, sheets) when native Liquid Glass is not available. */
  chrome: string;
  /** The lens that marks the selected item inside glass (tab bar, segmented control). */
  glassSelected: string;

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
  bgGlow: ['rgba(255, 255, 255, 0.9)', 'rgba(10, 10, 11, 0.06)'],

  surface: 'rgba(255, 255, 255, 0.52)',
  surfaceStrong: 'rgba(255, 255, 255, 0.76)',
  surfaceSubtle: 'rgba(255, 255, 255, 0.3)',
  surfaceSolid: '#FFFFFF',
  surfaceSunken: 'rgba(12, 12, 13, 0.045)',
  surfacePressed: 'rgba(12, 12, 13, 0.06)',

  glassBorder: 'rgba(12, 12, 13, 0.06)',
  glassHighlight: 'rgba(255, 255, 255, 0.95)',
  glassRimTop: 'rgba(255, 255, 255, 0.95)',
  glassRimBottom: 'rgba(255, 255, 255, 0.55)',
  chrome: 'rgba(250, 250, 248, 0.72)',
  glassSelected: 'rgba(12, 12, 13, 0.075)',

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
  bgGlow: ['rgba(255, 255, 255, 0.075)', 'rgba(255, 255, 255, 0.035)'],

  surface: 'rgba(38, 38, 43, 0.42)',
  surfaceStrong: 'rgba(28, 28, 32, 0.78)',
  surfaceSubtle: 'rgba(38, 38, 43, 0.24)',
  surfaceSolid: '#131316',
  surfaceSunken: 'rgba(0, 0, 0, 0.35)',
  surfacePressed: 'rgba(255, 255, 255, 0.07)',

  glassBorder: 'rgba(255, 255, 255, 0.07)',
  glassHighlight: 'rgba(255, 255, 255, 0.22)',
  glassRimTop: 'rgba(255, 255, 255, 0.2)',
  glassRimBottom: 'rgba(255, 255, 255, 0.07)',
  chrome: 'rgba(30, 30, 34, 0.66)',
  glassSelected: 'rgba(255, 255, 255, 0.12)',

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
  md: 16,
  lg: 26,
  xl: 34,
  pill: 999,
} as const;
export type Radius = keyof typeof radii;

/** BlurView intensity per glass strength. Android renders tint only (no native blur). */
export const blur = {
  subtle: 24,
  regular: 50,
  strong: 80,
} as const;
export type GlassStrength = keyof typeof blur;

export const motion = {
  fast: 120,
  normal: 220,
  slow: 360,
  /** Spring for presses and selection changes (Reanimated `withSpring`). */
  spring: { damping: 18, stiffness: 260, mass: 0.7 },
  /** Glass under a finger: squish in fast, settle back with a little give. */
  press: { damping: 14, stiffness: 420, mass: 0.6 },
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
  displayItalic: families.displayItalic,
  /** Cinzel, for small all-caps labels. */
  label: families.label[600],
  labelBold: families.label[700],
} as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily' | 'textTransform' | 'fontVariant' | 'fontStyle'>;

/**
 * Type ramp. Use through `<Text variant="…">`.
 *
 * Brand card: Playfair Display for big moments (headlines, the wordmark, the slogan), Inter
 * for everything you read, Cinzel for small all-caps labels (overlines, tab names), and
 * Inter with tabular figures for anything that counts (ratings, clocks).
 */
export const typography = {
  /** Hero headline. One per screen at most. */
  display: { fontFamily: families.display[600], fontSize: 38, lineHeight: 46, letterSpacing: -0.6 },
  /** Screen title. */
  title: { fontFamily: families.display[600], fontSize: 28, lineHeight: 36, letterSpacing: -0.4 },
  heading: { fontFamily: families.display[600], fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  /** The slogan and brand lines ("Think. Move. Win."), Playfair italic. */
  slogan: { fontFamily: families.displayItalic, fontSize: 20, lineHeight: 26, letterSpacing: 0 },
  subheading: { fontFamily: S[600], fontSize: 16, lineHeight: 21, letterSpacing: -0.2 },
  body: { fontFamily: S[400], fontSize: 15, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: S[500], fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  label: { fontFamily: S[500], fontSize: 13, lineHeight: 18, letterSpacing: -0.05 },
  caption: { fontFamily: S[400], fontSize: 12.5, lineHeight: 17 },
  /** Small uppercase mono label above sections and stats. */
  overline: { fontFamily: families.label[600], fontSize: 11, lineHeight: 15, letterSpacing: 1.2, textTransform: 'uppercase' },
  /** Ratings, counts, evaluations: fixed-width digits. */
  numeric: { fontFamily: M[500], fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  /** Big figures in stat blocks and time-control tiles. */
  figure: { fontFamily: M[500], fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  clock: { fontFamily: M[600], fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  mono: { fontFamily: M[400], fontSize: 13, lineHeight: 19, fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, TypeStyle>;
export type TextVariant = keyof typeof typography;

export function shadows(c: ColorTokens) {
  const k = c.scheme === 'dark' ? 3 : 1;
  // Android draws `elevation` as a solid shadow under the whole box, which shows through any
  // translucent fill as a grey slab. Glass there leans on the hairline edge instead.
  const android = Platform.OS === 'android';
  // iPhone: React Native can only give a shadow a cheap, cached outline when the view has a solid
  // background. Glass cards are translucent, so a plain shadow there falls back to a per-pixel
  // shadow that the GPU redraws off-screen on every frame anything on screen changes: with a dozen
  // cards on the home screen that kept the phone busy (and hot) just sitting open. A CSS-style box
  // shadow is drawn from the box's outline instead, once, and looks the same.
  if (Platform.OS === 'ios') {
    const ink = (a: number) => rgba(c.shadow, a);
    return {
      none: {},
      sm: { boxShadow: `0 1px 6px 0 ${ink(0.04 * k)}` } as ViewStyle,
      md: { boxShadow: `0 12px 30px 0 ${ink(0.07 * k)}` } as ViewStyle,
      lg: { boxShadow: `0 24px 50px 0 ${ink(0.12 * k)}` } as ViewStyle,
      float: floatShadow(c),
    } as const;
  }
  return {
    none: {},
    sm: { shadowColor: c.shadow, shadowOpacity: 0.04 * k, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: android ? 0 : 1 },
    md: { shadowColor: c.shadow, shadowOpacity: 0.07 * k, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: android ? 0 : 3 },
    lg: { shadowColor: c.shadow, shadowOpacity: 0.12 * k, shadowRadius: 50, shadowOffset: { width: 0, height: 24 }, elevation: android ? 2 : 8 },
    /**
     * Floating chrome (tab bar, sheets, header capsules): a wide, soft lift off the page. Drawn as
     * a CSS-style box shadow, which stays outside the box: it survives `overflow: hidden` (needed
     * to clip the glass) and never shows through a translucent fill as a grey slab on Android.
     */
    float: floatShadow(c),
  } as const;
}

function floatShadow(c: ColorTokens): ViewStyle {
  return { boxShadow: c.scheme === 'dark' ? '0 14px 36px 0 rgba(0,0,0,0.5), 0 2px 8px 0 rgba(0,0,0,0.3)' : '0 14px 36px 0 rgba(26,26,28,0.12), 0 2px 8px 0 rgba(26,26,28,0.06)' };
}

/** `#RRGGBB` plus an alpha, as `rgba(...)`. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.min(1, a).toFixed(3)})`;
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
    chrome: 'rgba(252, 252, 250, 0.97)',
  },
  dark: {
    surface: 'rgba(24, 24, 27, 0.94)',
    surfaceStrong: '#18181B',
    surfaceSubtle: 'rgba(20, 20, 23, 0.9)',
    chrome: 'rgba(26, 26, 30, 0.97)',
  },
};

export function makeTheme(scheme: ColorScheme): Theme {
  const c = Platform.OS === 'android' ? { ...colors[scheme], ...androidGlass[scheme] } : colors[scheme];
  return { scheme, colors: c, space, radii, blur, motion, layout, fonts, typography, shadows: shadows(c) };
}

export const themes = { light: makeTheme('light'), dark: makeTheme('dark') } as const;
