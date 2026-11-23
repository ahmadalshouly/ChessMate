import { StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Text } from '@/ui';

/**
 * The brand sign-off from the brand card: "ChessMate — More Than a Game." in
 * Playfair italic, with the brand vibe underneath (Elegant · Strategic ·
 * Modern · Community-driven · Timeless). Sits at the foot of a page.
 */
export function BrandLine() {
  const tr = useT();
  return (
    <View style={styles.box} accessibilityRole="text">
      <Text variant="slogan" tone="muted" align="center">
        {tr('brand.line')}
      </Text>
      <Text variant="overline" tone="tertiary" align="center" style={styles.vibe}>
        {tr('brand.vibe')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  vibe: { letterSpacing: 2 },
});
