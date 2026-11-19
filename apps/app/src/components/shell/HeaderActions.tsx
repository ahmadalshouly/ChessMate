import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';
import { useCurrentUser } from '@/lib/currentUser';

import { Avatar } from './Avatar';
import { MessagesButton } from './MessagesButton';

/** Sign-in screen; provided by the accounts work. */
export const SIGN_IN_HREF = '/sign-in' as Href;

/** Right side of the header: sign-in (guests), notifications and the avatar. */
export function HeaderActions({ showSignIn = true }: { showSignIn?: boolean }) {
  const t = useTheme();
  const user = useCurrentUser();
  const tr = useT();
  return (
    <View style={styles.row}>
      {showSignIn && user.status === 'guest' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(SIGN_IN_HREF)}
          style={({ pressed }) => [styles.signIn, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="log-in-outline" size={16} color={t.text} />
          <Text style={[styles.signInText, { color: t.text }]}>{tr('auth.signIn')}</Text>
        </Pressable>
      )}
      <MessagesButton />
      <NotificationBell />
      <Pressable accessibilityRole="button" accessibilityLabel={tr('nav.openProfile')} onPress={() => router.navigate('/profile')} hitSlop={6}>
        <Avatar name={user.displayName} url={user.avatarUrl} size={34} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signIn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  signInText: { fontSize: 13, fontWeight: '500' },
});
