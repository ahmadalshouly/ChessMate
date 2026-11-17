import { Stack } from 'expo-router';

import { ProfileView } from '@/features/profile/ProfileView';

export default function MyProfileScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ProfileView username={null} />
    </>
  );
}
