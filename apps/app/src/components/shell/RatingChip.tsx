import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';

/** Compact rating pill, e.g. "1200?" for a provisional rating. */
export function RatingChip({ rating, provisional }: { rating: number; provisional?: boolean }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View
      style={[styles.chip, { borderColor: t.border, backgroundColor: t.surface }]}
      accessibilityLabel={provisional ? tr('nav.ratingProvisional', { rating }) : tr('nav.ratingValue', { rating })}>
      <Ionicons name="trending-up" size={14} color={t.muted} />
      <Text style={[styles.text, { color: t.text }]}>
        {Math.round(rating)}
        {provisional ? '?' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1 },
  text: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
