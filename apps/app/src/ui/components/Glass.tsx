import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import type { Elevation, GlassStrength, Radius, Space } from '../theme/tokens';
import { Text } from './Text';

export interface GlassViewProps extends ViewProps {
  /** How frosted the panel is. Default `regular`. */
  strength?: GlassStrength;
  radius?: Radius;
  padding?: Space;
  elevation?: Elevation;
  /** Draw the bright top edge. Default true. */
  highlight?: boolean;
  /** Turn blur off (for long lists or nested glass) and use the tint only. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * The glass primitive every surface is built on: backdrop blur, a translucent tint, a
 * hairline edge and a soft sheen across the top third, the way light catches real glass.
 * On Android, `expo-blur` falls back to tint only, which still reads as frosted against
 * the page backdrop.
 */
export function GlassView({
  strength = 'regular',
  radius = 'lg',
  padding,
  elevation = 'md',
  highlight = true,
  flat,
  style,
  children,
  ...rest
}: GlassViewProps) {
  const t = useAppTheme();
  const c = t.colors;
  const dark = c.scheme === 'dark';
  const fill = strength === 'strong' ? c.surfaceStrong : strength === 'subtle' ? c.surfaceSubtle : c.surface;
  const r = t.radii[radius];
  const sheen = dark ? (['rgba(255,255,255,0.055)', 'rgba(255,255,255,0)'] as const) : (['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)'] as const);
  return (
    <View
      {...rest}
      style={[
        t.shadows[elevation],
        { borderRadius: r, borderWidth: StyleSheet.hairlineWidth, borderColor: c.glassBorder, overflow: 'hidden' },
        padding !== undefined && { padding: t.space[padding] },
        style,
      ]}>
      {!flat && Platform.OS !== 'android' && (
        <BlurView intensity={t.blur[strength]} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      )}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {highlight && (
        <>
          <LinearGradient pointerEvents="none" colors={sheen} locations={[0, 1]} style={[styles.sheen, { borderTopLeftRadius: r, borderTopRightRadius: r }]} />
          <View pointerEvents="none" style={[styles.edge, { left: r * 0.6, right: r * 0.6, backgroundColor: c.glassHighlight }]} />
        </>
      )}
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
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <GlassView {...glass} padding={padding} style={[{ gap: t.space[gap], transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}>
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.surfacePressed }]} />}
          {body}
        </GlassView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  edge: { position: 'absolute', top: 0, height: StyleSheet.hairlineWidth, opacity: 0.9 },
});
