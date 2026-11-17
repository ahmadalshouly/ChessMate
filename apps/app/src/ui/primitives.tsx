/**
 * Drop-in replacements for React Native's `Text` and `TextInput` that render in the
 * ChessMate typefaces. Screens that style text by hand (`fontWeight: '700'`) import these
 * instead of the React Native ones and get the right family for that weight:
 *
 *   import { Text, TextInput } from '@/ui/primitives';
 *
 * Prefer `<Text variant>` from '@/ui' in new code.
 */
import type { ComponentRef, Ref } from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

import { resolveFontStyle } from './theme/fonts';

export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={resolveFontStyle(style)} />;
}

export function TextInput({ style, ref, ...rest }: TextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> }) {
  return <RNTextInput {...rest} ref={ref} style={resolveFontStyle(style)} />;
}
