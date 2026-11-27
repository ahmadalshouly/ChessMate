import { ThemeProvider, usePathname, useTheme as useNavTheme } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { heatOff } from '@/lib/heatTest';
import { Probe } from '@/lib/Probe';
import { useProbe } from '@/lib/heatProbe';
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
  useProbe('AppShell');
  const bare = heatOff('shell');
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const tab = useActiveTab();
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const nav = useNavTheme();

  return (
    // Screens inside the shell sit on the shell's one backdrop: transparent screen containers, so the
    // page runs unbroken under the glass header and tab bar.
    <ThemeProvider value={{ ...nav, colors: { ...nav.colors, background: 'transparent' } }}>
    <BackdropContext value>
    <Tabs style={styles.fill}>
      {/* Registers the tab routes with the navigator; the visible UI is below. */}
      <TabList style={styles.hidden}>
        {TABS.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href} />
        ))}
      </TabList>

      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        {!bare && <Backdrop />}
        <View style={[styles.fill, wide && styles.row]}>
          {wide && <Sidebar />}
          <View style={styles.fill}>
            <Probe id="header">{!bare && <AppHeader title={tr(tab.title)} withSidebar={wide} />}</Probe>
            <RestrictionBanner style={styles.banner} />
            {wide ? (
              <TabSlot style={styles.fill} />
            ) : (
              // Screens run to the bottom edge so content scrolls on behind the floating glass tab
              // bar. The bar's height (with the bottom safe area) is handed to them as their
              // bottom inset, so scroll views pad for it and every screen can still reach its
              // last row; screens that don't scroll pad for it the same way.
              <View style={styles.fill}>
                <SafeAreaInsetsContext value={{ ...insets, bottom: tabBarSpace }}>
                  <Probe id="tabs">
                    <TabSlot style={styles.fill} />
                  </Probe>
                </SafeAreaInsetsContext>
                {/* The header has no bar, so content scrolling up fades out under it instead of being cut off. */}
                {!bare && <LinearGradient pointerEvents="none" colors={[t.bgGradient[0], fade(t.bgGradient[0])]} style={styles.fade} />}
              </View>
            )}
          </View>
        </View>
        <Probe id="tabbar">{!wide && !bare && <BottomTabBar />}</Probe>
      </View>
    </Tabs>
    </BackdropContext>
    </ThemeProvider>
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
