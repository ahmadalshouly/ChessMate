import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ColorScheme } from '@/ui';
import { shadows, colors } from '@/ui/theme/tokens';

import { useTheme } from '@/constants/theme';
import { LiquidLayers } from '@/ui/components/liquid';

/**
 * Liquid Glass surface for the app chrome (tab bar, header capsules, sidebar, menus). Chrome
 * floats above scrolling content: on iOS 26 it is Apple's native Liquid Glass, elsewhere a
 * strongly blurred, saturated tint with a specular rim, so content passing underneath shows
 * through as soft colour and shape rather than readable text.
 */
export function Glass({
  children,
  style,
  intensity = 60,
  radius = 0,
  sheen = true,
  interactive,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  /** Soft light across the top edge. */
  sheen?: boolean;
  /** Native glass reacts to touch (iOS 26). */
  interactive?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[{ borderRadius: radius, borderColor: t.glassBorder, overflow: 'hidden' }, styles.shell, style]}>
      <LiquidLayers kind="chrome" radius={radius} intensity={intensity} fill={t.chrome} sheen={sheen} interactive={interactive} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderWidth: StyleSheet.hairlineWidth },
});

/** Soft lift for floating chrome. A box shadow, so it is not clipped by the glass's `overflow: hidden`. */
export function floatShadow(scheme: ColorScheme): ViewStyle {
  return shadows(colors[scheme]).float;
}
