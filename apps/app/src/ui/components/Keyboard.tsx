import type { ComponentProps, Ref } from 'react';
import { Platform, type ScrollViewProps } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  useKeyboardHandler,
  useWindowDimensions,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import Animated, { measure, useAnimatedRef, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

/**
 * Keyboard handling for every screen with a text field, on iPhone and Android alike
 * (Android apps are edge-to-edge, so the window no longer shrinks for the keyboard).
 * Built on react-native-keyboard-controller; `KeyboardProvider` sits at the app root.
 *
 * - `KeyboardScrollView`: a ScrollView that scrolls the focused field into view above
 *   the keyboard. Use it for any scrolling page or form with inputs.
 * - `KeyboardAvoider`: a View that lifts its content (padding) by the part of the keyboard
 *   that covers it. Use it for a fixed composer at the bottom (chat) or a dialog. It finds
 *   its own place on screen each time the keyboard moves, so headers, tab bars and modals
 *   need no offsets.
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
  if (Platform.OS === 'ios') return <IosKeyboardAvoider {...props} />;
  return <KeyboardAvoidingView behavior="padding" automaticOffset {...props} />;
}

/**
 * iPhone: the library's `automaticOffset` reads the view's place on screen once, when it is
 * first laid out. A pushed screen is laid out while it is still being attached, so that read
 * can fail and fall back to the view's place in its parent, which leaves out the header: the
 * composer then lifts by too little and stays under the keyboard. Here the view measures
 * itself each time the keyboard starts to move, when the screen has settled, and pads its
 * bottom by exactly the part of the keyboard that covers it.
 */
function IosKeyboardAvoider({ style, enabled = true, keyboardVerticalOffset = 0, ...rest }: KeyboardAvoiderProps) {
  const ref = useAnimatedRef<Animated.View>();
  const { height: screenH } = useWindowDimensions();
  // Distance from the view's bottom edge to the bottom of the screen (padding never changes it).
  const below = useSharedValue(0);
  const lift = useSharedValue(0);

  useKeyboardHandler(
    {
      onStart: () => {
        'worklet';
        const m = measure(ref);
        // Not measurable (yet): lift by the whole keyboard, so the field is never covered.
        below.value = m ? Math.max(0, screenH - (m.pageY + m.height)) : 0;
      },
      onMove: (e) => {
        'worklet';
        lift.value = Math.max(0, e.height + keyboardVerticalOffset - below.value);
      },
      onInteractive: (e) => {
        'worklet';
        lift.value = Math.max(0, e.height + keyboardVerticalOffset - below.value);
      },
      onEnd: (e) => {
        'worklet';
        lift.value = e.height > 0 ? Math.max(0, e.height + keyboardVerticalOffset - below.value) : 0;
      },
    },
    [screenH, keyboardVerticalOffset],
  );

  const animated = useAnimatedStyle(() => ({ paddingBottom: enabled ? lift.value : 0 }), [enabled]);
  return <Animated.View {...rest} ref={ref} style={[style, animated]} />;
}

/** The ref type of `KeyboardScrollView` (a ScrollView with `scrollTo`, `scrollToEnd`, ...). */
export type KeyboardScrollViewRef = KeyboardAwareScrollViewRef;
