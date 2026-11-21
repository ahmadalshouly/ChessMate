import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { BAR_TAB_NAMES } from '@/navigation/more';
import { TABS } from '@/navigation/tabs';
import { Text } from '@/ui/primitives';

import { Glass } from './Glass';
import { MoreMenu } from './MoreMenu';
import { BarIcon, NavItem, barLabelStyle } from './NavItem';

export const TAB_BAR_HEIGHT = 66;
const GAP = 10;

/** Total space the floating tab bar covers, including the safe area. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, GAP) + GAP;
}

const BAR_TABS = TABS.filter((tab) => (BAR_TAB_NAMES as readonly string[]).includes(tab.name));
const BAR_HREFS = new Set(BAR_TABS.map((tab) => tab.href));

/**
 * Floating glass tab bar for phones and narrow windows: Play, Puzzles,
 * Tournaments, and More, which opens the side menu with everything else.
 */
export function BottomTabBar() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const first = '/' + (path.split('/')[1] ?? '');
  // More is "current" while you are in a section that lives in the menu (Learn, Social, Profile).
  const inMore = first !== '/' && !BAR_HREFS.has(first as (typeof BAR_TABS)[number]['href']);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, GAP) }]}>
      <Glass radius={33} intensity={80} style={styles.bar}>
        <View accessibilityRole="tablist" style={styles.row}>
          {BAR_TABS.map((tab) => (
            <NavItem key={tab.name} tab={tab} variant="bar" />
          ))}
          <MoreButton active={inMore || open} onPress={() => setOpen(true)} />
        </View>
      </Glass>
      <MoreMenu visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function MoreButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('more.title')}
      onPress={onPress}
      style={({ pressed }) => [styles.more, { opacity: pressed ? 0.6 : 1 }]}>
      <BarIcon focused={active} icon={active ? 'menu' : 'menu-outline'} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[barLabelStyle, { color: active ? t.text : t.textTertiary }]}>
        {tr('more.title')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 480,
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  row: { flexDirection: 'row', paddingHorizontal: 6 },
  more: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
});
