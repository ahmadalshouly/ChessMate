import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
  sheen = true,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  /** Soft light across the top edge. */
  sheen?: boolean;
}) {
  const t = useTheme();
  const dark = t.scheme === 'dark';
  return (
    <View style={[{ borderRadius: radius, borderColor: t.glassBorder, overflow: 'hidden' }, styles.shell, Platform.OS === 'web' && webBlur(intensity), style]}>
      {Platform.OS === 'ios' && <BlurView intensity={intensity} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'android' ? t.surfaceSolid : t.surfaceStrong }]} />
      {sheen && (
        <LinearGradient
          pointerEvents="none"
          colors={dark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
          style={[styles.sheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        />
      )}
      <View pointerEvents="none" style={[styles.highlight, { backgroundColor: t.glassHighlight, left: radius * 0.6, right: radius * 0.6 }]} />
      {children}
    </View>
  );
}

/** Browsers blur what is behind the element natively (CSS backdrop-filter). */
function webBlur(intensity: number): ViewStyle {
  const px = Math.round(intensity / 2.5);
  return { backdropFilter: `blur(${px}px) saturate(180%)`, WebkitBackdropFilter: `blur(${px}px) saturate(180%)` } as unknown as ViewStyle;
}

const styles = StyleSheet.create({
  shell: { borderWidth: StyleSheet.hairlineWidth },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  highlight: { position: 'absolute', top: 0, height: StyleSheet.hairlineWidth, opacity: 0.9 },
});
