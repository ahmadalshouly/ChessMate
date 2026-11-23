import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import type { Elevation, GlassStrength, Radius, Space } from '../theme/tokens';
import { LiquidLayers, PressableScale, type LiquidLayerKind } from './liquid';
import { Text } from './Text';

export interface GlassViewProps extends ViewProps {
  /** How frosted the panel is. Default `regular`. */
  strength?: GlassStrength;
  radius?: Radius;
  padding?: Space;
  elevation?: Elevation;
  /** Draw the top sheen. Default true. */
  highlight?: boolean;
  /** Turn blur off (for long lists or nested glass) and use the tint only. */
  flat?: boolean;
  /**
   * - panel (default): content cards. Native Liquid Glass on iOS 26 with a faint tint for text.
   * - chrome: floating navigation (bars, sheets). Native Liquid Glass on iOS 26.
   * - control: buttons and small capsules. Native Liquid Glass on iOS 26, reacts to touch.
   */
  kind?: LiquidLayerKind;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * The glass primitive every surface is built on: backdrop blur with extra saturation, a thin
 * tint, a specular rim (bright along the top, a soft bounce along the bottom) and a sheen
 * across the top, the way light catches real glass. Chrome and controls switch to Apple's
 * native Liquid Glass on iOS 26 (see `liquid.tsx`).
 */
export function GlassView({
  strength = 'regular',
  radius = 'lg',
  padding,
  elevation = 'md',
  highlight = true,
  flat,
  kind = 'panel',
  style,
  children,
  ...rest
}: GlassViewProps) {
  const t = useAppTheme();
  const c = t.colors;
  const fill = kind !== 'panel' ? c.chrome : strength === 'strong' ? c.surfaceStrong : strength === 'subtle' ? c.surfaceSubtle : c.surface;
  const r = t.radii[radius];
  return (
    <View
      {...rest}
      style={[
        t.shadows[elevation],
        { borderRadius: r, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, overflow: 'hidden' },
        padding !== undefined && { padding: t.space[padding] },
        style,
      ]}>
      <LiquidLayers kind={kind} radius={r} intensity={t.blur[strength]} fill={fill} flat={flat} sheen={highlight} interactive={kind === 'control'} />
      {children}
    </View>
  );
}

export interface CardProps extends Omit<GlassViewProps, 'children'> {
  title?: string;
  subtitle?: string;
  /** Element at the right of the header (a button, badge or link). */
  headerRight?: ReactNode;
  /** Makes the whole card pressable. */
  onPress?: () => void;
  /** Gap between children. Default `md`. */
  gap?: Space;
  children?: ReactNode;
}

/** Padded glass panel with an optional header. The default container for screen sections. */
export function Card({ title, subtitle, headerRight, onPress, gap = 'md', padding = 'lg', children, style, ...glass }: CardProps) {
  const t = useAppTheme();
  const body = (
    <>
      {(title || headerRight) && (
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            {title && <Text variant="heading">{title}</Text>}
            {subtitle && (
              <Text variant="caption" tone="muted">
                {subtitle}
              </Text>
            )}
          </View>
          {headerRight}
        </View>
      )}
      {children}
    </>
  );
  if (!onPress) {
    return (
      <GlassView {...glass} padding={padding} style={[{ gap: t.space[gap] }, style]}>
        {body}
      </GlassView>
    );
  }
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" scaleTo={0.985}>
      {({ pressed }) => (
        <GlassView {...glass} padding={padding} style={[{ gap: t.space[gap] }, style]}>
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.surfacePressed }]} />}
          {body}
        </GlassView>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
