import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { SIDEBAR_BREAKPOINT, TABS } from '@/navigation/tabs';
import { Backdrop, BackdropContext } from '@/ui';

import { AppHeader } from './AppHeader';
import { BottomTabBar, useTabBarSpace } from './BottomTabBar';
import { RestrictionBanner } from './RestrictionBanner';
import { Sidebar } from './Sidebar';

function useActiveTab() {
  const path = usePathname();
  const first = '/' + (path.split('/')[1] ?? '');
  return TABS.find((tab) => tab.href !== '/' && first === tab.href) ?? TABS[0];
}

/**
 * The app frame around every top-level section: glass header, plus a floating
 * bottom tab bar on narrow screens or a sidebar on wide ones.
 */
export function AppShell() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const tab = useActiveTab();
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const tr = useT();

  return (
    <BackdropContext value>
    <Tabs style={styles.fill}>
      {/* Registers the tab routes with the navigator; the visible UI is below. */}
      <TabList style={styles.hidden}>
        {TABS.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href} />
        ))}
      </TabList>

      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        <Backdrop />
        <View style={[styles.fill, wide && styles.row]}>
          {wide && <Sidebar />}
          <View style={styles.fill}>
            <AppHeader title={tr(tab.title)} withSidebar={wide} />
            <RestrictionBanner style={styles.banner} />
            {wide ? (
              <TabSlot style={styles.fill} />
            ) : (
              // Screens end where the floating tab bar begins, so every screen (scrolling or not)
              // can reach its last row. The bar's space already includes the bottom safe area,
              // so screens inside see a bottom inset of 0 and don't pad for it twice.
              <View style={[styles.fill, { paddingBottom: tabBarSpace }]}>
                <SafeAreaInsetsContext value={{ ...insets, bottom: 0 }}>
                  <TabSlot style={styles.fill} />
                </SafeAreaInsetsContext>
                {/* The header has no bar, so content scrolling up fades out under it instead of being cut off. */}
                <LinearGradient pointerEvents="none" colors={[t.bgGradient[0], fade(t.bgGradient[0])]} style={styles.fade} />
              </View>
            )}
          </View>
        </View>
        {!wide && <BottomTabBar />}
      </View>
    </Tabs>
    </BackdropContext>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row' },
  hidden: { display: 'none' },
  banner: { marginHorizontal: 12, marginTop: 4, marginBottom: 4 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 14 },
});

/** The same colour, fully transparent (a hex colour plus zero alpha), so the fade has no grey cast. */
function fade(hex: string) {
  return hex.startsWith('#') && hex.length === 7 ? `${hex}00` : 'transparent';
}
