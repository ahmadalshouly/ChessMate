import { Stack } from 'expo-router';

import { ProfileView } from '@/features/profile/ProfileView';
import { useT } from '@/i18n';

export default function MyProfileScreen() {
  const tr = useT();
  return (
    <>
      <Stack.Screen options={{ title: tr('nav.profile') }} />
      <ProfileView username={null} />
    </>
  );
}
