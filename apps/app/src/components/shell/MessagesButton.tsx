import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { useUnreadMessages } from '@/lib/messagesApi';
import { useSocialIdentity } from '@/lib/social/session';
import { Text } from '@/ui/primitives';

/** Header button for Messages with the unread count, next to the notification bell. */
export function MessagesButton() {
  const t = useTheme();
  const tr = useT();
  const me = useSocialIdentity();
  const unread = useUnreadMessages();
  if (!me) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? tr('messages.unread', { count: unread }) : tr('messages.title')}
      hitSlop={10}
      onPress={() => router.push('/messages')}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="chatbubble-ellipses-outline" size={21} color={t.text} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: t.accent, borderColor: t.surfaceSolid }]}>
          <Text style={[styles.badgeText, { color: t.onAccent }]}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 6, marginHorizontal: 2 },
  badge: { position: 'absolute', top: 0, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
