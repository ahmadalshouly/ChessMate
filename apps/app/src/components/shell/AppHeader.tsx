import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

import { Glass } from './Glass';
import { HeaderActions } from './HeaderActions';
import { Logo } from './Logo';

/**
 * Top bar of the app shell. On phones it carries the logo mark and section title;
 * next to the sidebar it is a quiet row with the section title and actions.
 */
export function AppHeader({ title, withSidebar }: { title: string; withSidebar: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  if (withSidebar) {
    return (
      <View style={[styles.wideRow, { borderBottomColor: t.border }]}>
        <Text style={[styles.wideTitle, { color: t.text }]} accessibilityRole="header">
          {title}
        </Text>
        <HeaderActions />
      </View>
    );
  }

  return (
    <Glass intensity={60} sheen={false} style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Logo size={28} wordmark={false} />
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
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  title: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.4, flexShrink: 1 },
  wideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 32,
    paddingTop: 22,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wideTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.8 },
});
