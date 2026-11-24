import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { KeyboardScrollView } from '@/ui/components/Keyboard';

/**
 * Scrollable, centred content area for screens inside the app shell. The shell draws the
 * background; content scrolls on behind the floating tab bar, whose height arrives as the
 * bottom inset.
 */
export function Page({ children, maxWidth = MAX_CONTENT_WIDTH }: { children: ReactNode; maxWidth?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} scrollIndicatorInsets={{ bottom: insets.bottom }}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </KeyboardScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16, paddingTop: 20, alignItems: 'center' },
  inner: { width: '100%', gap: 28 },
});
