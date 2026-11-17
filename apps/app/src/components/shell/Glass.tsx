import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

/** Frosted-glass surface used by the header, tab bar and sidebar. */
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
    <View style={[{ borderRadius: radius, borderColor: t.glassBorder, overflow: 'hidden' }, styles.shell, style]}>
      <BlurView intensity={intensity} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.surface }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderWidth: StyleSheet.hairlineWidth * 2 },
});
