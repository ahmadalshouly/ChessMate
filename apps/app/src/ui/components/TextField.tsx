import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { TextInput } from '@/ui/primitives';

import { useAppTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { translate } from '@/i18n';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  /** Shown under the field; replaced by `error` when set. */
  helper?: string;
  /** Error message. Turns the field red and is announced to screen readers. */
  error?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  /** Adds a Show/Hide control for passwords. Implies `secureTextEntry`. */
  password?: boolean;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: ComponentProps<typeof TextInput>['ref'];
}

/**
 * Labelled text input in a sunken glass well with a focus ring.
 *
 *   <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
 *   <TextField label="Password" password value={pw} onChangeText={setPw} error={err} />
 */
export function TextField({ label, helper, error, left, right, password, disabled, containerStyle, onFocus, onBlur, ref, ...input }: TextFieldProps) {
  const t = useAppTheme();
  const c = t.colors;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? c.danger : focused ? c.focusRing : c.border;

  return (
    <View style={[{ gap: 6, opacity: disabled ? 0.5 : 1 }, containerStyle]}>
      {label && (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      )}
      <View
        style={[
          styles.well,
          { backgroundColor: c.surfaceSunken, borderColor, borderRadius: t.radii.md, borderWidth: focused || error ? 1.5 : StyleSheet.hairlineWidth * 2 },
        ]}>
        {left}
        <TextInput
          ref={ref}
          {...input}
          editable={!disabled && input.editable !== false}
          secureTextEntry={password ? !revealed : input.secureTextEntry}
          placeholderTextColor={c.textTertiary}
          selectionColor={c.accent}
          accessibilityLabel={input.accessibilityLabel ?? label}
          accessibilityHint={error ?? helper}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[t.typography.body, styles.input, { color: c.text }, webNoOutline]}
        />
        {password && (
          <Pressable accessibilityRole="button" onPress={() => setRevealed((v) => !v)} hitSlop={8}>
            <Text variant="label" tone="muted">
              {revealed ? translate('auth.field.hide') : translate('auth.field.show')}
            </Text>
          </Pressable>
        )}
        {right}
      </View>
      {(error || helper) && (
        <Text variant="caption" tone={error ? 'danger' : 'muted'} accessibilityLiveRegion={error ? 'polite' : 'none'}>
          {error || helper}
        </Text>
      )}
    </View>
  );
}

// The focus ring is drawn on the well; hide the browser's own outline.
const webNoOutline = { outlineStyle: 'none' } as unknown as ViewStyle;

const styles = StyleSheet.create({
  well: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 46 },
  input: { flex: 1, paddingVertical: 12 },
});
