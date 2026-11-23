import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { BAR_TAB_NAMES } from '@/navigation/more';
import { TABS } from '@/navigation/tabs';
import { Text } from '@/ui/primitives';
import { motion } from '@/ui';
import { PressableScale, rimShadow } from '@/ui/components/liquid';

import { Glass, floatShadow } from './Glass';
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
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const first = '/' + (path.split('/')[1] ?? '');
  // More is "current" while you are in a section that lives in the menu (Learn, Social, Profile).
  const inMore = first !== '/' && !BAR_HREFS.has(first as (typeof BAR_TABS)[number]['href']);
  const active = open || inMore ? BAR_TABS.length : Math.max(0, BAR_TABS.findIndex((tab) => tab.href === first || (tab.href === '/' && first === '/')));
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, GAP) }]}>
      <Glass radius={TAB_BAR_HEIGHT / 2} intensity={80} interactive style={[styles.bar, floatShadow(t.scheme)]}>
        <View accessibilityRole="tablist" style={styles.row}>
          <Lens index={active} count={BAR_TABS.length + 1} />
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

/**
 * The selected tab's lens: one glass pill that springs from tab to tab instead of each tab
 * switching a highlight on and off.
 */
function Lens({ index, count }: { index: number; count: number }) {
  const t = useTheme();
  const { rtl } = useI18n();
  const [width, setWidth] = useState(0);
  const w = width / count;
  // Native swaps `left` for `right` in right-to-left layouts; the web does not.
  const slot = rtl && Platform.OS === 'web' ? count - 1 - index : index;
  const x = (rtl && Platform.OS !== 'web' ? -1 : 1) * slot * w;
  const tx = useSharedValue(x);
  useEffect(() => {
    tx.value = withSpring(x, motion.spring);
  }, [x, tx]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {w > 0 && <Animated.View style={[styles.lens, { width: w - 4, backgroundColor: t.glassSelected }, rimShadow(t, 'bright'), anim]} />}
    </View>
  );
}

function MoreButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={tr('more.title')} onPress={onPress} scaleTo={0.88} style={styles.more}>
      <BarIcon focused={active} icon={active ? 'menu' : 'menu-outline'} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[barLabelStyle, { color: active ? t.text : t.muted }]}>
        {tr('more.title')}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 480,
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', marginHorizontal: 6, alignSelf: 'stretch', flex: 1 },
  lens: { position: 'absolute', top: 6, bottom: 6, left: 2, borderRadius: 999 },
  more: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
});
