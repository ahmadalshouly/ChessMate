import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useTheme } from '@/constants/theme';
import { useCurrentUser } from '@/lib/currentUser';

import { Avatar } from './Avatar';
import { RatingChip } from './RatingChip';

/** Sign-in screen; provided by the accounts work. */
export const SIGN_IN_HREF = '/sign-in' as Href;

/** Right side of the header: rating, sign-in (guests) and the avatar. */
export function HeaderActions({ showSignIn = true }: { showSignIn?: boolean }) {
  const t = useTheme();
  const user = useCurrentUser();
  return (
    <View style={styles.row}>
      {user.rating != null && <RatingChip rating={user.rating} provisional={user.provisional} />}
      {showSignIn && user.status === 'guest' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(SIGN_IN_HREF)}
          style={({ pressed }) => [styles.signIn, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="log-in-outline" size={16} color={t.text} />
          <Text style={[styles.signInText, { color: t.text }]}>Sign in</Text>
        </Pressable>
      )}
      <NotificationBell />
      <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.navigate('/profile')} hitSlop={6}>
        <Avatar name={user.displayName} url={user.avatarUrl} size={34} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signIn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1 },
  signInText: { fontSize: 13, fontWeight: '600' },
});
