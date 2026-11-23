import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

import { Glass, floatShadow } from './Glass';
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

  // No bar: the page backdrop runs to the top edge, the title sits on it, and the actions
  // float in one glass capsule, the way iOS groups toolbar buttons.
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Logo size={28} wordmark={false} />
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <Glass radius={23} interactive style={[styles.capsule, floatShadow(t.scheme)]}>
          <HeaderActions showSignIn={false} />
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingBottom: 8, paddingHorizontal: 16 },
  capsule: { height: 46, paddingStart: 8, paddingEnd: 6, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, flexShrink: 1 },
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
