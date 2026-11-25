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

// On the web a text box is not positioned (React Native Web leaves it `static`), so the
// absolutely positioned glass layers of a Card (blur, tint, sheen) paint over it and the
// text can't be seen. Positioning it puts it back in source order, above those layers,
// as it is on iOS and Android.
const ON_TOP = { position: 'relative' } as const;

export function TextInput({ style, ref, ...rest }: TextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> }) {
  return <RNTextInput {...rest} ref={ref} style={[ON_TOP, resolveFontStyle(style)]} />;
}
