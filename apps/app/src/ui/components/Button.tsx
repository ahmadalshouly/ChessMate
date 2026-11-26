import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { GlassView } from './Glass';
import { PressableScale } from './liquid';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'review';

/** The Review button's fill: black in both themes, so it stands out from every other button. */
export const REVIEW_BLACK = '#0B0B0D';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  /**
   * - primary: solid black (light) / white (dark). One per view.
   * - secondary: glass. Most actions.
   * - ghost: text only, for tertiary actions and links.
   * - danger: destructive (resign, delete account).
   * - review: black in light and dark themes, white text. Only for opening a
   *   game review (see ReviewButton, which adds the "!!" badge).
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
  sm: { height: 34, px: 14, radius: 17, text: 'label' as const },
  md: { height: 46, px: 20, radius: 23, text: 'bodyStrong' as const },
  lg: { height: 56, px: 26, radius: 28, text: 'subheading' as const },
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
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.onDanger : variant === 'review' ? '#FFFFFF' : c.text;
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      scaleTo={variant === 'ghost' ? 0.97 : 0.95}
      style={[fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}>
      {({ pressed }) => {
        const pressStyle = { opacity: disabled ? 0.35 : 1 };
        if (variant === 'secondary') {
          return (
            <GlassView kind="control" radius="pill" elevation="sm" style={[{ borderRadius: s.radius }, pressStyle]}>
              {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfacePressed }]} />}
              {content}
            </GlassView>
          );
        }
        const solid = variant === 'primary' || variant === 'danger' || variant === 'review';
        const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : variant === 'review' ? REVIEW_BLACK : pressed ? c.surfacePressed : 'transparent';
        // A black button on a dark page needs a light edge to show where it ends.
        const reviewEdge = variant === 'review' && c.scheme === 'dark' ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' } : null;
        return (
          <View style={[{ borderRadius: s.radius, backgroundColor: bg, overflow: 'hidden' }, solid && t.shadows.md, reviewEdge, pressStyle]}>
            {/* Solid buttons are glass too: a lit top half and a specular rim over the fill. */}
            {solid && <LinearGradient pointerEvents="none" colors={c.scheme === 'light' || variant === 'danger' || variant === 'review' ? ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']} style={styles.shine} />}
            {solid && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: s.radius }, solidRim(variant === 'primary' && c.scheme === 'dark')]} />}
            {pressed && solid && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.scheme === 'light' || variant === 'review' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />}
            {content}
          </View>
        );
      }}
    </PressableScale>
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Math.max(0, (44 - size) / 2)}
      scaleTo={0.9}
      style={style}>
      {({ pressed }) => {
        const box = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
        const fx = { opacity: disabled ? 0.4 : 1 };
        if (variant === 'glass') {
          return (
            <GlassView kind="control" radius="pill" elevation="sm" style={[box, fx]}>
              {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfacePressed }]} />}
              {icon}
            </GlassView>
          );
        }
        return <View style={[box, fx, { backgroundColor: variant === 'solid' ? c.accent : pressed ? c.surfacePressed : 'transparent' }]}>{icon}</View>;
      }}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: '60%' },
});

/** Specular rim for solid buttons: lit along the top edge, a faint shade along the bottom. */
function solidRim(lightFill: boolean): ViewStyle {
  return {
    boxShadow: lightFill
      ? 'inset 0 1px 0 0 rgba(255,255,255,1), inset 0 -1px 0 0 rgba(0,0,0,0.08)'
      : 'inset 0 1px 0 0 rgba(255,255,255,0.28), inset 0 -1px 0 0 rgba(255,255,255,0.08)',
  } as ViewStyle;
}
