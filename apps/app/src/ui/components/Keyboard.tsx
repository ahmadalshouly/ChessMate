import type { ComponentProps, Ref } from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/**
 * Keyboard handling for every screen with a text field, on iPhone and Android alike
 * (Android apps are edge-to-edge, so the window no longer shrinks for the keyboard).
 * Built on react-native-keyboard-controller; `KeyboardProvider` sits at the app root.
 *
 * - `KeyboardScrollView`: a ScrollView that scrolls the focused field into view above
 *   the keyboard. Use it for any scrolling page or form with inputs.
 * - `KeyboardAvoider`: a View that lifts its content (padding) by the part of the keyboard
 *   that covers it. Use it for a fixed composer at the bottom (chat) or a dialog. It finds
 *   its own place on screen, so headers, tab bars and modals need no offsets.
 *
 * On the web both are their plain React Native counterparts.
 */

/** Gap kept between the focused field and the top of the keyboard. */
export const KEYBOARD_GAP = 24;

export type KeyboardScrollViewProps = ScrollViewProps & {
  /** Space between the focused field and the keyboard. Default `KEYBOARD_GAP`. */
  bottomOffset?: number;
  ref?: Ref<KeyboardAwareScrollViewRef>;
};

export function KeyboardScrollView({ bottomOffset = KEYBOARD_GAP, keyboardShouldPersistTaps = 'handled', ref, ...rest }: KeyboardScrollViewProps) {
  return <KeyboardAwareScrollView ref={ref} bottomOffset={bottomOffset} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...rest} />;
}

export type KeyboardAvoiderProps = Omit<ComponentProps<typeof KeyboardAvoidingView>, 'behavior' | 'automaticOffset'>;

export function KeyboardAvoider(props: KeyboardAvoiderProps) {
  return <KeyboardAvoidingView behavior="padding" automaticOffset {...props} />;
}

/** The ref type of `KeyboardScrollView` (a ScrollView with `scrollTo`, `scrollToEnd`, ...). */
export type KeyboardScrollViewRef = KeyboardAwareScrollViewRef;
