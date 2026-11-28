import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useT } from '@/i18n';
import { SIDEBAR_BREAKPOINT } from '@/navigation/tabs';
import { Text, useAppTheme } from '@/ui';

/** Shown to admins on the web while maintenance mode is on, so nobody forgets to switch it off. Opens Admin → Maintenance. */
export function MaintenancePill() {
  const tr = useT();
  const c = useAppTheme().colors;
  const { width } = useWindowDimensions();
  // Above the bottom tab bar on narrow screens.
  const bottom = width >= SIDEBAR_BREAKPOINT ? 16 : 96;
  return (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFill,
        {
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: bottom,
        },
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={tr('admin.maintenance.pill')}
        onPress={() => router.push('/admin/maintenance')}
        style={({ pressed }) => [styles.pill, { backgroundColor: c.warning, opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="construct-outline" size={14} color="#000" />
        <Text variant="caption" color="#000" style={{ fontWeight: '700' }}>
          {tr('admin.maintenance.pill')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
});
