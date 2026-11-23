import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/ui';

import { awardIcon, tierColor } from './catalog';

const SIZES = { sm: 40, md: 56, lg: 96 } as const;

/** A medallion: the award's icon in a ring coloured by its level (grey while locked). */
export function AwardBadge({ id, level, maxLevel, size = 'md' }: { id: string; level: number; maxLevel?: number; size?: keyof typeof SIZES }) {
  const t = useAppTheme();
  const c = t.colors;
  const d = SIZES[size];
  const locked = level === 0;
  const color = locked ? c.textTertiary : tierColor(level);
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={[
          styles.ring,
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            borderWidth: Math.max(2, d / 16),
            borderColor: color,
            backgroundColor: locked ? c.surface : `${color}22`,
            opacity: locked ? 0.6 : 1,
          },
        ]}>
        <MaterialCommunityIcons name={awardIcon(id)} size={d * 0.46} color={color} />
      </View>
      {maxLevel !== undefined && maxLevel > 1 && (
        <View style={styles.pips}>
          {Array.from({ length: maxLevel }, (_, i) => (
            <View key={i} style={[styles.pip, { backgroundColor: i < level ? tierColor(i + 1) : c.border }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 6, height: 6, borderRadius: 3 },
});
