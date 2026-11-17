import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { initialsOf } from '@/lib/currentUser';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const t = useTheme();
  const ring = { width: size, height: size, borderRadius: size / 2, borderColor: t.borderStrong };
  if (url) return <Image source={{ uri: url }} style={[styles.base, ring]} accessibilityLabel={name} />;
  return (
    <View style={[styles.base, ring, { backgroundColor: t.surfaceSunken }]} accessibilityLabel={name}>
      <Text style={{ color: t.text, fontFamily: fonts.monoMedium, fontSize: size * 0.34, letterSpacing: -0.3 }}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
