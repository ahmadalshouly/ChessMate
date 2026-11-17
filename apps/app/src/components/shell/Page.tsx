import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MAX_CONTENT_WIDTH } from '@/constants/theme';

import { useShellInsets } from './ShellInsets';

/**
 * Scrollable, centred content area for screens inside the app shell. Leaves
 * room for the floating tab bar. The shell already draws the background.
 */
export function Page({ children, maxWidth = MAX_CONTENT_WIDTH }: { children: ReactNode; maxWidth?: number }) {
  const { bottom } = useShellInsets();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16, paddingTop: 16, alignItems: 'center' },
  inner: { width: '100%', gap: 16 },
});
