import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

/** Compact mono rating pill, e.g. "1200?" for a provisional rating. */
export function RatingChip({ rating, provisional }: { rating: number; provisional?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[styles.chip, { borderColor: t.border, backgroundColor: t.surfaceSunken }]}
      accessibilityLabel={`Rating ${rating}${provisional ? ', provisional' : ''}`}>
      <Text style={[styles.k, { color: t.textTertiary }]}>ELO</Text>
      <Text style={[styles.text, { color: t.text }]}>
        {Math.round(rating)}
        {provisional ? '?' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  k: { fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1 },
  text: { fontFamily: fonts.monoMedium, fontSize: 13, fontVariant: ['tabular-nums'] },
});
