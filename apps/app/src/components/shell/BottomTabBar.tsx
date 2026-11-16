import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TABS } from '@/navigation/tabs';

import { Glass } from './Glass';
import { NavItem } from './NavItem';

export const TAB_BAR_HEIGHT = 64;
const GAP = 10;

/** Total space the floating tab bar covers, including the safe area. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, GAP) + GAP;
}

/** Floating glass tab bar for phones and narrow windows. */
export function BottomTabBar() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, GAP) }]}>
      <Glass radius={26} intensity={70} style={styles.bar}>
        <View accessibilityRole="tablist" style={styles.row}>
          {TABS.map((tab) => (
            <NavItem key={tab.name} tab={tab} variant="bar" />
          ))}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 520,
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  row: { flexDirection: 'row', paddingHorizontal: 6 },
});
