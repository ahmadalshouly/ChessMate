import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';
import { dirIcon, useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useCurrentUser } from '@/lib/currentUser';
import { MORE_SECTIONS } from '@/navigation/more';
import { SIDEBAR_WIDTH, TABS } from '@/navigation/tabs';

/** More-menu items that are already main sections in the sidebar. */
const IN_TABS = new Set(['learn', 'tournaments', 'friends', 'profile']);
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

import { Avatar } from './Avatar';
import { Glass } from './Glass';
import { SIGN_IN_HREF } from './HeaderActions';
import { Logo } from './Logo';
import { NavItem } from './NavItem';

/** Left navigation for wide screens (desktop web, tablets in landscape): a flush glass rail. */
export function Sidebar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const tr = useT();
  const { user: account } = useAuth();
  const staff = account?.role === 'moderator' || account?.role === 'admin';
  return (
    <Glass intensity={50} sheen={false} style={[styles.panel, { width: SIDEBAR_WIDTH, paddingTop: insets.top + 22, paddingBottom: insets.bottom + 16, paddingStart: insets.left + 14 }]}>
      <View style={styles.logo}>
        <Logo size={30} />
        <Text style={[styles.tagline, { color: t.textTertiary }]}>{tr('brand.tagline')}</Text>
      </View>
      <Text style={[styles.section, { color: t.textTertiary }]}>{tr('nav.section')}</Text>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View accessibilityRole="tablist" style={styles.nav}>
          {TABS.map((tab, i) => (
            <NavItem key={tab.name} tab={tab} variant="side" index={i} />
          ))}
        </View>
        {/* Everything else from the phone's More menu, minus what is already above. */}
        {MORE_SECTIONS.map((section) => {
          const items = section.items.filter((it) => !IN_TABS.has(it.key));
          if (!items.length) return null;
          return (
            <View key={section.title} style={{ marginTop: 16 }}>
              <Text style={[styles.section, { color: t.textTertiary }]}>{tr(section.title)}</Text>
              {items.map((it) => (
                <Pressable
                  key={it.key}
                  accessibilityRole="link"
                  disabled={it.soon}
                  onPress={() => it.href && router.navigate(it.href)}
                  style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.extra, hovered && !it.soon && { backgroundColor: t.surfaceSunken }, it.soon && { opacity: 0.5 }]}>
                  <Ionicons name={it.icon} size={16} color={t.muted} />
                  <Text style={[styles.extraText, { color: t.muted }]}>{tr(it.label)}</Text>
                  {it.soon && <Text style={[styles.soon, { color: t.textTertiary }]}>{tr('more.soon')}</Text>}
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>
      {staff && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate('/admin')}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.admin, { borderColor: t.border }, hovered && { backgroundColor: t.surfaceSunken }]}>
          <Ionicons name="shield-half-outline" size={16} color={t.text} />
          <Text style={[styles.adminText, { color: t.text }]}>{tr('admin.title')}</Text>
        </Pressable>
      )}
      <View style={[styles.userCard, { borderColor: t.border }]}>
        <Pressable onPress={() => router.navigate('/profile')} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.userRow, hovered && { backgroundColor: t.surfaceSunken }]} accessibilityRole="button">
          <Avatar name={user.displayName} url={user.avatarUrl} size={36} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.userName, { color: t.text }]}>
              {user.displayName}
            </Text>
            <Text style={[styles.userMeta, { color: t.muted }]}>
              {user.rating != null ? `${Math.round(user.rating)}${user.provisional ? '?' : ''} ${tr('nav.elo')}` : tr('nav.unrated').toLocaleUpperCase()}
            </Text>
          </View>
          <Ionicons name={dirIcon('chevron-forward')} size={14} color={t.textTertiary} />
        </Pressable>
        {user.status === 'guest' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(SIGN_IN_HREF)}
            style={({ pressed }) => [styles.signIn, { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={[styles.signInText, { color: t.onAccent }]}>{tr('nav.signInToSave')}</Text>
            <Ionicons name={dirIcon('arrow-forward')} size={14} color={t.onAccent} />
          </Pressable>
        )}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, marginEnd: 8 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 36, borderRadius: 10 },
  extraText: { fontFamily: fonts.sansMedium, fontSize: 13.5, flex: 1 },
  soon: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  tagline: { fontFamily: fonts.label, fontSize: 9.5, letterSpacing: 1.8, textTransform: 'uppercase', marginTop: 6 },
  panel: { paddingEnd: 14, borderTopWidth: 0, borderBottomWidth: 0, borderStartWidth: 0 },
  logo: { paddingHorizontal: 8, paddingBottom: 30 },
  section: { fontFamily: fonts.label, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 14, paddingBottom: 10 },
  nav: { gap: 2 },
  userCard: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: 12 },
  userName: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
  userMeta: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.6, marginTop: 2 },
  signIn: { height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  signInText: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  adminText: { fontFamily: fonts.sansMedium, fontSize: 13.5 },
});
