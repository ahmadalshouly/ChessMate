import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { useCurrentUser } from '@/lib/currentUser';
import { SIDEBAR_WIDTH, TABS } from '@/navigation/tabs';

import { Avatar } from './Avatar';
import { Glass } from './Glass';
import { SIGN_IN_HREF } from './HeaderActions';
import { Logo } from './Logo';
import { NavItem } from './NavItem';

/** Left navigation for wide screens (desktop web, tablets in landscape). */
export function Sidebar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const tr = useT();
  return (
    <Glass
      radius={22}
      intensity={60}
      style={[styles.panel, { width: SIDEBAR_WIDTH, marginTop: insets.top + 12, marginBottom: insets.bottom + 12, marginLeft: insets.left + 12 }]}>
      <View style={styles.logo}>
        <Logo size={34} />
      </View>
      <View accessibilityRole="tablist" style={styles.nav}>
        {TABS.map((tab) => (
          <NavItem key={tab.name} tab={tab} variant="side" />
        ))}
      </View>
      <View style={[styles.userCard, { borderColor: t.border }]}>
        <Pressable onPress={() => router.navigate('/profile')} style={styles.userRow} accessibilityRole="button">
          <Avatar name={user.displayName} url={user.avatarUrl} size={38} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.userName, { color: t.text }]}>
              {user.displayName}
            </Text>
            <Text style={[styles.userMeta, { color: t.muted }]}>
              {user.rating != null ? tr('nav.ratingValue', { rating: `${Math.round(user.rating)}${user.provisional ? '?' : ''}` }) : tr('nav.unrated')}
            </Text>
          </View>
        </Pressable>
        {user.status === 'guest' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(SIGN_IN_HREF)}
            style={({ pressed }) => [styles.signIn, { backgroundColor: t.accent, opacity: pressed ? 0.75 : 1 }]}>
            <Text style={[styles.signInText, { color: t.onAccent }]}>{tr('nav.signInToSave')}</Text>
          </Pressable>
        )}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 14 },
  logo: { paddingHorizontal: 6, paddingTop: 6, paddingBottom: 22 },
  nav: { gap: 4, flex: 1 },
  userCard: { borderTopWidth: 1, paddingTop: 14, gap: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  userName: { fontSize: 15, fontWeight: '700' },
  userMeta: { fontSize: 12, marginTop: 1 },
  signIn: { height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  signInText: { fontSize: 13, fontWeight: '700' },
});
