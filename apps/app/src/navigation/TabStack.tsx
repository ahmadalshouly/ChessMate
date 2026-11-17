import { Stack } from 'expo-router';

import { StackHeader } from '@/components/shell/StackHeader';

/**
 * Stack used inside every tab. The tab's `index` screen sits under the shell
 * header with no header of its own; deeper screens (e.g. `puzzles/[id].tsx`)
 * get a glass header with a back button. Set their title with
 * `<Stack.Screen options={{ title: '…' }} />` inside the screen.
 */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        header: (props) => <StackHeader {...props} />,
        contentStyle: { backgroundColor: 'transparent' },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
