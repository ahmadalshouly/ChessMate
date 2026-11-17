import { Stack } from 'expo-router';

import { EditProfile } from '@/features/profile/EditProfile';
import { useT } from '@/i18n';

export default function EditProfileScreen() {
  const tr = useT();
  return (
    <>
      <Stack.Screen options={{ title: tr('profile.edit') }} />
      <EditProfile />
    </>
  );
}
