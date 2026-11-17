import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';

import { Page } from './Page';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Placeholder for a section that is still being built. */
export function ComingSoon({
  icon,
  title,
  blurb,
  features,
}: {
  icon: IconName;
  title: string;
  blurb: string;
  features: { icon: IconName; title: string; text: string }[];
}) {
  const t = useTheme();
  return (
    <Page>
      <Card>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { borderColor: t.borderStrong }]}>
            <Ionicons name={icon} size={24} color={t.text} />
          </View>
          <View style={[styles.badge, { borderColor: t.border, backgroundColor: t.surfaceSunken }]}>
            <Text style={[styles.badgeText, { color: t.muted }]}>COMING SOON</Text>
          </View>
        </View>
        <Label size={24} bold>
          {title}
        </Label>
        <Label muted>{blurb}</Label>
      </Card>
      <View style={styles.grid}>
        {features.map((f) => (
          <View key={f.title} style={styles.cell}>
            <Card style={styles.featureCard}>
              <Ionicons name={f.icon} size={20} color={t.muted} />
              <Label bold>{f.title}</Label>
              <Label muted size={14}>
                {f.text}
              </Label>
            </Card>
          </View>
        ))}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: 'GeistMono_500Medium', fontSize: 10, letterSpacing: 1.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  cell: { width: '50%', minWidth: 260, flexGrow: 1, padding: 6 },
  featureCard: { flex: 1 },
});
