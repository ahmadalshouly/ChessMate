import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { useNotifications } from '@/lib/notifications';

import { BellIcon } from './BellIcon';

/** Header bell with unread badge; opens the notification center. */
export function NotificationBell() {
  const t = useTheme();
  const tr = useT();
  const { unread } = useNotifications();
  const label = unread > 0 ? tr('notifications.bellUnread', { count: unread }) : tr('settings.notifications.title');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}>
      <BellIcon color={t.text} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: t.accent, borderColor: t.surfaceSolid }]}>
          <Text style={[styles.badgeText, { color: t.onAccent }]}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 6, marginHorizontal: 4 },
  badge: {
    position: 'absolute',
    top: 0,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
