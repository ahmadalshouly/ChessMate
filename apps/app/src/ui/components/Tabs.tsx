import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { rimShadow } from './liquid';
import { Text } from './Text';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Small count shown after the label. */
  count?: number;
}

export interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /**
   * - segmented: glass track with a sliding pill (equal widths). For 2 to 4 options.
   * - underline: text tabs with a sliding bar. For page sections.
   */
  variant?: 'segmented' | 'underline';
}

const useNative = Platform.OS !== 'web';

/**
 *   <Tabs items={[{ key: 'games', label: 'Games' }, { key: 'stats', label: 'Stats' }]} value={tab} onChange={setTab} />
 */
export function Tabs<K extends string>({ items, value, onChange, variant = 'segmented' }: TabsProps<K>) {
  const t = useAppTheme();
  const c = t.colors;
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const [pos] = useState(() => new Animated.Value(index));
  const segmented = variant === 'segmented';
  const inset = segmented ? 3 : 0;
  const segW = width > 0 ? (width - inset * 2) / items.length : 0;

  useEffect(() => {
    Animated.spring(pos, { toValue: index, useNativeDriver: useNative, speed: 22, bounciness: 4 }).start();
  }, [index, pos]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        segmented
          ? { backgroundColor: c.surfaceSunken, borderRadius: t.radii.md, padding: inset }
          : { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
      ]}>
      {segW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            segmented
              ? [{ top: inset, bottom: inset, borderRadius: t.radii.md - inset, backgroundColor: c.scheme === 'dark' ? c.glassSelected : c.surfaceStrong }, rimShadow(c, 'bright'), t.shadows.sm]
              : { bottom: -StyleSheet.hairlineWidth, height: 2, borderRadius: 1, backgroundColor: c.accent },
            {
              position: 'absolute',
              left: inset,
              width: segW,
              transform: [{ translateX: pos.interpolate({ inputRange: [0, Math.max(1, items.length - 1)], outputRange: [0, segW * Math.max(1, items.length - 1)] }) }],
            },
          ]}
        />
      )}
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            style={[styles.tab, { height: segmented ? 34 : 42 }]}>
            <Text variant="label" tone={active ? 'default' : 'muted'} numberOfLines={1}>
              {item.label}
            </Text>
            {item.count !== undefined && (
              <Text variant="caption" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
                {item.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignSelf: 'stretch' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
});
