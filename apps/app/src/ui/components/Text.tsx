import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { resolveFontStyle } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeProvider';
import type { ColorTokens, TextVariant } from '../theme/tokens';

export type TextTone = 'default' | 'muted' | 'tertiary' | 'inverse' | 'accent' | 'success' | 'warning' | 'danger';

export interface TextProps extends RNTextProps {
  /** Type ramp entry. Default `body`. */
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'auto' | 'left' | 'center' | 'right';
  /** Override the colour directly (prefer `tone`). */
  color?: string;
}

export function toneColor(c: ColorTokens, tone: TextTone): string {
  switch (tone) {
    case 'muted':
      return c.muted;
    case 'tertiary':
      return c.textTertiary;
    case 'inverse':
      return c.textInverse;
    case 'accent':
      return c.accent;
    case 'success':
      return c.success;
    case 'warning':
      return c.warning;
    case 'danger':
      return c.danger;
    default:
      return c.text;
  }
}

/**
 * Themed text. Always use this instead of React Native's `Text` so type and colour
 * follow the design system.
 *
 *   <Text variant="title">Play</Text>
 *   <Text tone="muted">Real-time games</Text>
 */
export function Text({ variant = 'body', tone = 'default', align, color, style, ...rest }: TextProps) {
  const t = useAppTheme();
  return <RNText {...rest} style={resolveFontStyle([t.typography[variant], { color: color ?? toneColor(t.colors, tone) }, align && { textAlign: align }, style])} />;
}
