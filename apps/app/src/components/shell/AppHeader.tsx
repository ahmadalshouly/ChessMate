import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';

import { Glass } from './Glass';
import { HeaderActions } from './HeaderActions';
import { Logo } from './Logo';

/**
 * Top bar of the app shell. On phones it carries the logo and section title;
 * next to the sidebar it shows the section title only (the logo is in the
 * sidebar).
 */
export function AppHeader({ title, withSidebar }: { title: string; withSidebar: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  if (withSidebar) {
    return (
      <View style={styles.wideRow}>
        <Text style={[styles.wideTitle, { color: t.text }]} accessibilityRole="header">
          {title}
        </Text>
        <HeaderActions />
      </View>
    );
  }

  return (
    <Glass intensity={60} style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Logo size={30} wordmark={false} />
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <HeaderActions showSignIn={false} />
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, paddingBottom: 10, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, flexShrink: 1 },
  wideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 10,
  },
  wideTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
});
