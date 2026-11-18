import { Stack } from 'expo-router';

import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { useT } from '@/i18n';

export default function Settings() {
  const tr = useT();
  return (
    <>
      <Stack.Screen options={{ title: tr('settings.title') }} />
      <SettingsScreen />
    </>
  );
}
