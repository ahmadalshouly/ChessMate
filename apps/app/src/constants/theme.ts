/**
 * Compatibility layer for screens written before the design system.
 * New code should import from '@/ui' (useAppTheme, useColors, useBoardTheme).
 */
import { boardThemes, colors, layout, useColors, type ColorTokens } from '@/ui';

export const palette = colors;

/** Default (monochrome) board colours. Prefer `useBoardTheme()` so the user's choice applies. */
export const board = boardThemes.graphite;

export type Palette = ColorTokens;

/** Colour tokens for the active light/dark scheme (respects the user's appearance setting). */
export function useTheme(): Palette {
  return useColors();
}

export const MAX_CONTENT_WIDTH = layout.maxContentWidth;
