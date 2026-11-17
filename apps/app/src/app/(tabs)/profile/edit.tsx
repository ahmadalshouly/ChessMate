import { Stack } from 'expo-router';

import { EditProfile } from '@/features/profile/EditProfile';

export default function EditProfileScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Edit profile' }} />
      <EditProfile />
    </>
  );
}
