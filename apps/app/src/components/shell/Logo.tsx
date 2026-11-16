import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';

/** Knight mark in a rounded tile, optionally followed by the wordmark. */
export function Logo({ size = 32, wordmark = true }: { size?: number; wordmark?: boolean }) {
  const t = useTheme();
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="ChessMate">
      <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.accent }]}>
        <MaterialCommunityIcons name="chess-knight" size={size * 0.66} color={t.onAccent} />
      </View>
      {wordmark && <Text style={[styles.word, { color: t.text, fontSize: size * 0.56 }]}>ChessMate</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { alignItems: 'center', justifyContent: 'center' },
  word: { fontWeight: '800', letterSpacing: -0.4 },
});
