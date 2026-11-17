import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { initialsOf } from '@/lib/currentUser';

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const t = useTheme();
  const ring = { width: size, height: size, borderRadius: size / 2, borderColor: t.glassBorder };
  if (url) return <Image source={{ uri: url }} style={[styles.base, ring]} accessibilityLabel={name} />;
  return (
    <View style={[styles.base, ring, { backgroundColor: t.text }]} accessibilityLabel={name}>
      <Text style={{ color: t.bg, fontWeight: '700', fontSize: size * 0.38 }}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, overflow: 'hidden' },
});
