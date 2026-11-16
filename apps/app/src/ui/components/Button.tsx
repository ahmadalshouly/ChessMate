import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { GlassView } from './Glass';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  /**
   * - primary: solid black (light) / white (dark). One per view.
   * - secondary: glass. Most actions.
   * - ghost: text only, for tertiary actions and links.
   * - danger: destructive (resign, delete account).
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZES = {
  sm: { height: 34, px: 12, radius: 10, text: 'label' as const },
  md: { height: 44, px: 18, radius: 14, text: 'bodyStrong' as const },
  lg: { height: 52, px: 22, radius: 16, text: 'subheading' as const },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const t = useAppTheme();
  const c = t.colors;
  const s = SIZES[size];
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.onDanger : c.text;
  const inactive = disabled || loading;

  const content = (
    <View style={[styles.content, { height: s.height, paddingHorizontal: s.px }]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : leftIcon}
      <Text variant={s.text} color={fg} numberOfLines={1}>
        {title}
      </Text>
      {!loading && rightIcon}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={[fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}>
      {({ pressed }) => {
        const pressStyle = { opacity: disabled ? 0.4 : pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] };
        if (variant === 'secondary') {
          return (
            <GlassView radius="md" elevation="sm" style={[{ borderRadius: s.radius }, pressStyle]}>
              {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfacePressed }]} />}
              {content}
            </GlassView>
          );
        }
        const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : pressed ? c.surfacePressed : 'transparent';
        return (
          <View style={[{ borderRadius: s.radius, backgroundColor: bg, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'transparent' }, variant === 'primary' && t.shadows.sm, pressStyle]}>{content}</View>
        );
      }}
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: ReactNode;
  /** Required: icon buttons have no visible text. */
  accessibilityLabel: string;
  onPress?: () => void;
  size?: number;
  variant?: 'glass' | 'solid' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Round icon-only button (header actions, board controls). */
export function IconButton({ icon, accessibilityLabel, onPress, size = 40, variant = 'glass', disabled, style }: IconButtonProps) {
  const c = useAppTheme().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={style}>
      {({ pressed }) => {
        const box = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
        const fx = { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 };
        if (variant === 'glass') {
          return (
            <GlassView radius="pill" elevation="sm" style={[box, fx]}>
              {icon}
            </GlassView>
          );
        }
        return <View style={[box, fx, { backgroundColor: variant === 'solid' ? c.accent : pressed ? c.surfacePressed : 'transparent' }]}>{icon}</View>;
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
