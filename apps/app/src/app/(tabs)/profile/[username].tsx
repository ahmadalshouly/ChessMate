import { Stack, useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/features/profile/ProfileView';
import { useT } from '@/i18n';

export default function PlayerProfileScreen() {
  const tr = useT();
  const { username } = useLocalSearchParams<{ username: string }>();
  return (
    <>
      <Stack.Screen options={{ title: username ? `@${username}` : tr('nav.profile') }} />
      <ProfileView username={username ?? null} />
    </>
  );
}
