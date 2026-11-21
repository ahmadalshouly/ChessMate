import { Stack } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';

import { RootStackHeader, StackHeader } from '@/components/shell/StackHeader';
import { AdminGate } from '@/features/admin/AdminContext';
import { AdminRail } from '@/features/admin/AdminNav';
import { useT } from '@/i18n';
import { useAppTheme } from '@/ui';

/** Admin console: staff only. A side rail on wide screens, a stack with a hub dashboard on phones. */
export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const tr = useT();
  const { colors: c } = useAppTheme();
  const stack = (
    <Stack
      screenOptions={{
        header: (props) => (wide ? <StackHeader {...props} insetTop /> : <RootStackHeader {...props} />),
        contentStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Screen name="index" options={{ title: tr('admin.title'), headerShown: !wide }} />
      <Stack.Screen name="players/index" options={{ title: tr('admin.nav.players'), headerShown: !wide }} />
      <Stack.Screen name="reports" options={{ title: tr('admin.nav.reports'), headerShown: !wide }} />
      <Stack.Screen name="fairplay/index" options={{ title: tr('admin.nav.fairplay'), headerShown: !wide }} />
      <Stack.Screen name="titles/index" options={{ title: tr('admin.nav.titles'), headerShown: !wide }} />
      <Stack.Screen name="games/index" options={{ title: tr('admin.nav.games'), headerShown: !wide }} />
      <Stack.Screen name="audit" options={{ title: tr('admin.nav.audit'), headerShown: !wide }} />
      <Stack.Screen name="tournaments/index" options={{ title: tr('admin.nav.tournaments'), headerShown: !wide }} />
      <Stack.Screen name="sponsors" options={{ title: tr('admin.nav.sponsors'), headerShown: !wide }} />
      <Stack.Screen name="payouts" options={{ title: tr('admin.nav.payouts'), headerShown: !wide }} />
      <Stack.Screen name="messages" options={{ title: tr('admin.nav.messages'), headerShown: !wide }} />
    </Stack>
  );
  return (
    <AdminGate>
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
          <AdminRail />
          <View style={{ flex: 1 }}>{stack}</View>
        </View>
      ) : (
        stack
      )}
    </AdminGate>
  );
}
