import { useColorScheme } from 'react-native';

/**
 * ChessMate brand: monochrome (black and white) with frosted-glass surfaces.
 * Professional, calm, and readable; colour is reserved for game signals.
 */
export const palette = {
  light: {
    scheme: 'light' as const,
    bg: '#F4F4F5',
    bgGradient: ['#FFFFFF', '#E7E7EA'] as const,
    surface: 'rgba(255, 255, 255, 0.62)',
    surfaceSolid: '#FFFFFF',
    glassBorder: 'rgba(255, 255, 255, 0.9)',
    text: '#0B0B0C',
    muted: '#5E5E66',
    accent: '#0B0B0C',
    onAccent: '#FFFFFF',
    danger: '#C93838',
    border: 'rgba(11, 11, 12, 0.10)',
  },
  dark: {
    scheme: 'dark' as const,
    bg: '#0A0A0B',
    bgGradient: ['#1A1A1D', '#050506'] as const,
    surface: 'rgba(255, 255, 255, 0.07)',
    surfaceSolid: '#17171A',
    glassBorder: 'rgba(255, 255, 255, 0.14)',
    text: '#F5F5F7',
    muted: '#9C9CA4',
    accent: '#F5F5F7',
    onAccent: '#0A0A0B',
    danger: '#FF6464',
    border: 'rgba(255, 255, 255, 0.12)',
  },
};

/** Greyscale board that matches the brand. */
export const board = {
  light: '#EDEDEF',
  dark: '#8E8E96',
  lastMove: 'rgba(255, 214, 10, 0.38)',
  selected: 'rgba(10, 10, 11, 0.28)',
  check: 'rgba(201, 56, 56, 0.72)',
  threat: 'rgba(201, 56, 56, 0.32)',
  hint: 'rgba(10, 10, 11, 0.30)',
};

export type Palette = (typeof palette)['light'] | (typeof palette)['dark'];

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export const MAX_CONTENT_WIDTH = 720;
