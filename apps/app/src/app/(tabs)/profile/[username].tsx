import { Stack, useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/features/profile/ProfileView';

export default function PlayerProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return (
    <>
      <Stack.Screen options={{ title: username ? `@${username}` : 'Profile' }} />
      <ProfileView username={username ?? null} />
    </>
  );
}
