import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

/** Full-screen brand background: soft monochrome gradient behind glass panels. */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={t.bgGradient} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const t = useTheme();
  const solid = variant !== 'secondary';
  const bg = variant === 'primary' ? t.accent : variant === 'danger' ? t.danger : t.surface;
  const fg = variant === 'primary' ? t.onAccent : variant === 'danger' ? '#FFFFFF' : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: solid ? 'transparent' : t.glassBorder, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Frosted-glass panel. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[styles.cardShell, { borderColor: t.glassBorder }, style]}>
      <BlurView intensity={40} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.surface }]} />
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function Label({ children, muted, size = 15, bold }: { children: ReactNode; muted?: boolean; size?: number; bold?: boolean }) {
  const t = useTheme();
  return (
    <Text style={{ color: muted ? t.muted : t.text, fontSize: size, fontWeight: bold ? '700' : '400', letterSpacing: bold && size > 20 ? -0.5 : 0 }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  cardShell: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  cardBody: { padding: 16, gap: 10 },
});
