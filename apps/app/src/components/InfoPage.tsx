import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BrandLine } from '@/components/shell/BrandLine';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT, type TKey } from '@/i18n';
import { GlassView, Text } from '@/ui';

/**
 * A plain reading page (About, Support, Privacy, Fair play): title, intro,
 * then sections of text, with optional actions and the brand line at the end.
 */
export function InfoPage({ title, intro, sections, children, updated }: { title: TKey; intro: TKey; sections: [TKey, TKey][]; children?: ReactNode; updated?: TKey }) {
  const tr = useT();
  return (
    <Screen>
      <Stack.Screen options={{ title: tr(title) }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <View style={{ gap: 8 }}>
            <Text variant="title">{tr(title)}</Text>
            <Text tone="muted" style={{ lineHeight: 23 }}>
              {tr(intro)}
            </Text>
            {updated && (
              <Text variant="caption" tone="tertiary">
                {tr(updated)}
              </Text>
            )}
          </View>
          {children}
          <GlassView radius="xl" padding="lg" style={{ gap: 18 }}>
            {sections.map(([h, b]) => (
              <View key={h} style={{ gap: 6 }}>
                <Text variant="heading">{tr(h)}</Text>
                <Text style={{ lineHeight: 23 }}>{tr(b)}</Text>
              </View>
            ))}
          </GlassView>
          <BrandLine />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
});
