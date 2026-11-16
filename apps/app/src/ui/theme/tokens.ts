import { Platform, type TextStyle } from 'react-native';

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
  bg: '#F4F4F5',
  bgGradient: ['#FFFFFF', '#E4E4E7'],
  bgGlow: ['rgba(10, 10, 11, 0.07)', 'rgba(10, 10, 11, 0.04)'],

  surface: 'rgba(255, 255, 255, 0.62)',
  surfaceStrong: 'rgba(255, 255, 255, 0.84)',
  surfaceSubtle: 'rgba(255, 255, 255, 0.38)',
  surfaceSolid: '#FFFFFF',
  surfaceSunken: 'rgba(11, 11, 12, 0.05)',
  surfacePressed: 'rgba(11, 11, 12, 0.07)',

  glassBorder: 'rgba(255, 255, 255, 0.9)',
  glassHighlight: 'rgba(255, 255, 255, 1)',

  text: '#0B0B0C',
  muted: '#5E5E66',
  textTertiary: '#8E8E96',
  textInverse: '#FFFFFF',

  accent: '#0B0B0C',
  onAccent: '#FFFFFF',

  border: 'rgba(11, 11, 12, 0.10)',
  borderStrong: 'rgba(11, 11, 12, 0.22)',
  focusRing: 'rgba(11, 11, 12, 0.45)',

  overlay: 'rgba(10, 10, 11, 0.28)',

  success: '#1E7F4A',
  successSoft: 'rgba(30, 127, 74, 0.12)',
  warning: '#A86A12',
  warningSoft: 'rgba(168, 106, 18, 0.13)',
  danger: '#C93838',
  dangerSoft: 'rgba(201, 56, 56, 0.11)',
  onDanger: '#FFFFFF',
  live: '#22A45D',

  skeleton: 'rgba(11, 11, 12, 0.07)',
  skeletonHighlight: 'rgba(11, 11, 12, 0.13)',

  shadow: '#000000',
};

const dark: ColorTokens = {
  scheme: 'dark',
  bg: '#0A0A0B',
  bgGradient: ['#1A1A1D', '#050506'],
  bgGlow: ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.04)'],

  surface: 'rgba(255, 255, 255, 0.07)',
  surfaceStrong: 'rgba(28, 28, 32, 0.86)',
  surfaceSubtle: 'rgba(255, 255, 255, 0.04)',
  surfaceSolid: '#17171A',
  surfaceSunken: 'rgba(0, 0, 0, 0.32)',
  surfacePressed: 'rgba(255, 255, 255, 0.10)',

  glassBorder: 'rgba(255, 255, 255, 0.14)',
  glassHighlight: 'rgba(255, 255, 255, 0.22)',

  text: '#F5F5F7',
  muted: '#9C9CA4',
  textTertiary: '#6C6C74',
  textInverse: '#0A0A0B',

  accent: '#F5F5F7',
  onAccent: '#0A0A0B',

  border: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.24)',
  focusRing: 'rgba(255, 255, 255, 0.55)',

  overlay: 'rgba(0, 0, 0, 0.55)',

  success: '#3DD68C',
  successSoft: 'rgba(61, 214, 140, 0.14)',
  warning: '#F5B544',
  warningSoft: 'rgba(245, 181, 68, 0.14)',
  danger: '#FF6464',
  dangerSoft: 'rgba(255, 100, 100, 0.14)',
  onDanger: '#FFFFFF',
  live: '#3DD68C',

  skeleton: 'rgba(255, 255, 255, 0.06)',
  skeletonHighlight: 'rgba(255, 255, 255, 0.12)',

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
  lg: 20,
  xl: 28,
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
  normal: 200,
  slow: 320,
} as const;

export const layout = {
  /** Readable column width for content screens on tablets and desktop web. */
  maxContentWidth: 720,
  /** Wide layouts (board + side panel). */
  maxWideWidth: 1200,
  /** Minimum touch target. */
  hitSize: 44,
} as const;

const sans = Platform.select({
  web: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined, // native system font (SF Pro / Roboto)
});
const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  default: undefined,
});

export const fonts = { sans, mono } as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily' | 'textTransform' | 'fontVariant'>;

/** Type ramp. Use through `<Text variant="…">`. */
export const typography = {
  display: { fontFamily: sans, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontFamily: sans, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontFamily: sans, fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  subheading: { fontFamily: sans, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontFamily: sans, fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontFamily: sans, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontFamily: sans, fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.1 },
  caption: { fontFamily: sans, fontSize: 12, lineHeight: 16, fontWeight: '400' },
  overline: { fontFamily: sans, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  /** Ratings, clocks, evaluations: fixed-width digits. */
  numeric: { fontFamily: sans, fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clock: { fontFamily: sans, fontSize: 24, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  mono: { fontFamily: mono, fontSize: 13, lineHeight: 19, fontWeight: '400' },
} as const satisfies Record<string, TypeStyle>;
export type TextVariant = keyof typeof typography;

export function shadows(c: ColorTokens) {
  const k = c.scheme === 'dark' ? 2.2 : 1;
  return {
    none: {},
    sm: { shadowColor: c.shadow, shadowOpacity: 0.05 * k, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    md: { shadowColor: c.shadow, shadowOpacity: 0.08 * k, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
    lg: { shadowColor: c.shadow, shadowOpacity: 0.14 * k, shadowRadius: 40, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
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

export function makeTheme(scheme: ColorScheme): Theme {
  const c = colors[scheme];
  return { scheme, colors: c, space, radii, blur, motion, layout, fonts, typography, shadows: shadows(c) };
}

export const themes = { light: makeTheme('light'), dark: makeTheme('dark') } as const;
