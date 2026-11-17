import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

/**
 * Frosted-glass surface used by the app chrome (header, tab bar, sidebar).
 * Chrome sits over scrolling content, so it uses the stronger tint: content
 * passing underneath is blurred and dimmed rather than read through.
 */
export function Glass({
  children,
  style,
  intensity = 50,
  radius = 0,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
}) {
  const t = useTheme();
  return (
    <View style={[{ borderRadius: radius, borderColor: t.glassBorder, overflow: 'hidden' }, styles.shell, Platform.OS === 'web' && webBlur(intensity), style]}>
      {Platform.OS === 'ios' && <BlurView intensity={intensity} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'android' ? t.surfaceSolid : t.surfaceStrong }]} />
      <View pointerEvents="none" style={[styles.highlight, { backgroundColor: t.glassHighlight, left: radius / 2, right: radius / 2 }]} />
      {children}
    </View>
  );
}

/** Browsers blur what is behind the element natively (CSS backdrop-filter). */
function webBlur(intensity: number): ViewStyle {
  const px = Math.round(intensity / 3);
  return { backdropFilter: `blur(${px}px) saturate(160%)`, WebkitBackdropFilter: `blur(${px}px) saturate(160%)` } as unknown as ViewStyle;
}

const styles = StyleSheet.create({
  shell: { borderWidth: StyleSheet.hairlineWidth * 2 },
  highlight: { position: 'absolute', top: 0, height: StyleSheet.hairlineWidth * 2, opacity: 0.6 },
});
