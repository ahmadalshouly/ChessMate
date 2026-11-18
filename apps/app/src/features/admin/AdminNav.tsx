import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminPermission } from '@chessmate/core';
import { router, usePathname, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/shell/Glass';
import { Logo } from '@/components/shell/Logo';
import { dirIcon, useT, type TKey } from '@/i18n';
import { Avatar, Badge, Text, useAppTheme } from '@/ui';

import { useAdmin } from './AdminContext';
import { roleTone } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const ADMIN_SECTIONS: { key: string; href: Href; label: TKey; icon: IconName; needs: AdminPermission }[] = [
  { key: 'dashboard', href: '/admin', label: 'admin.nav.dashboard', icon: 'speedometer-outline', needs: 'dashboard.view' },
  { key: 'players', href: '/admin/players', label: 'admin.nav.players', icon: 'people-outline', needs: 'players.view' },
  { key: 'reports', href: '/admin/reports', label: 'admin.nav.reports', icon: 'flag-outline', needs: 'reports.view' },
  { key: 'fairplay', href: '/admin/fairplay', label: 'admin.nav.fairplay', icon: 'shield-checkmark-outline', needs: 'fairplay.view' },
  { key: 'games', href: '/admin/games', label: 'admin.nav.games', icon: 'grid-outline', needs: 'games.view' },
  { key: 'audit', href: '/admin/audit', label: 'admin.nav.audit', icon: 'document-text-outline', needs: 'audit.view' },
];

export const ADMIN_RAIL_WIDTH = 248;

function activeKey(path: string): string {
  const seg = path.replace(/^\/admin\/?/, '').split('/')[0];
  return seg || 'dashboard';
}

/** Left rail of the console on wide screens. */
export function AdminRail() {
  const { colors: c } = useAppTheme();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const { me, can } = useAdmin();
  const current = activeKey(usePathname());
  return (
    <Glass intensity={50} sheen={false} style={[styles.rail, { width: ADMIN_RAIL_WIDTH, paddingTop: insets.top + 22, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.brand}>
        <Logo size={26} />
        <Text variant="overline" tone="tertiary" style={{ marginTop: 10 }}>
          {tr('admin.title')}
        </Text>
      </View>
      <View style={{ gap: 2, flex: 1 }}>
        {ADMIN_SECTIONS.filter((s) => can(s.needs)).map((s) => {
          const on = s.key === current;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(s.href)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.item,
                on ? { backgroundColor: c.accent } : hovered ? { backgroundColor: c.surfaceSunken } : null,
              ]}>
              <Ionicons name={s.icon} size={17} color={on ? c.onAccent : c.muted} />
              <Text variant="label" color={on ? c.onAccent : c.text}>
                {tr(s.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.foot, { borderTopColor: c.border }]}>
        <View style={styles.me}>
          <Avatar name={me.username} size={32} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label" numberOfLines={1}>
              {me.username}
            </Text>
            <Badge label={tr(`admin.roles.${me.role}`)} tone={roleTone(me.role)} />
          </View>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.navigate('/')} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.item, hovered && { backgroundColor: c.surfaceSunken }]}>
          <Ionicons name={dirIcon('arrow-back')} size={16} color={c.muted} />
          <Text variant="label" tone="muted">
            {tr('admin.nav.back')}
          </Text>
        </Pressable>
      </View>
    </Glass>
  );
}

/** Section links as a grid, for the phone dashboard (no rail there). */
export function AdminSectionLinks() {
  const { colors: c } = useAppTheme();
  const tr = useT();
  const { can } = useAdmin();
  return (
    <View style={styles.links}>
      {ADMIN_SECTIONS.filter((s) => s.key !== 'dashboard' && can(s.needs)).map((s) => (
        <Pressable
          key={s.key}
          accessibilityRole="link"
          onPress={() => router.push(s.href)}
          style={({ pressed }) => [styles.link, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name={s.icon} size={18} color={c.text} />
          <Text variant="label">{tr(s.label)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: 14, borderTopWidth: 0, borderBottomWidth: 0, borderStartWidth: 0 },
  brand: { paddingHorizontal: 8, paddingBottom: 26 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 40, paddingHorizontal: 12, borderRadius: 12 },
  foot: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 8 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingBottom: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
