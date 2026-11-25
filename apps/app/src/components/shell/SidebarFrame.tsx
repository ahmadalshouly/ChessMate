import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { SIDEBAR_BREAKPOINT } from '@/navigation/tabs';

import { AppHeader } from './AppHeader';
import { Sidebar } from './Sidebar';

/** True where a screen outside the tabs should show the sidebar (see SidebarFrame). */
export function useSidebarFrame(): boolean {
  return useWindowDimensions().width >= SIDEBAR_BREAKPOINT;
}

/**
 * The app shell's sidebar and header around a screen that lives outside the tab navigator
 * (the analysis board), so wide screens keep the menu. Hide the stack header while it shows:
 *
 *   const framed = useSidebarFrame();
 *   <Stack.Screen options={{ headerShown: !framed }} />
 *   <SidebarFrame title="Analysis board" actions={<ShareGameButton … />}>…</SidebarFrame>
 *
 * Phones and narrow windows get the children as they are.
 */
export function SidebarFrame({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const framed = useSidebarFrame();
  if (!framed) return <>{children}</>;
  return (
    <View style={[styles.fill, styles.row]}>
      <Sidebar standalone />
      <View style={styles.fill}>
        <AppHeader title={title} withSidebar actions={actions} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  row: { flexDirection: 'row' },
});
