import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MAX_CONTENT_WIDTH } from '@/constants/theme';

/**
 * Scrollable, centred content area for screens inside the app shell. The shell
 * already keeps screens clear of the tab bar and draws the background.
 */
export function Page({ children, maxWidth = MAX_CONTENT_WIDTH }: { children: ReactNode; maxWidth?: number }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 32 }]}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16, paddingTop: 20, alignItems: 'center' },
  inner: { width: '100%', gap: 28 },
});
