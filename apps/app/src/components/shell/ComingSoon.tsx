import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n';

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
  const tr = useT();
  return (
    <Page>
      <Card>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: t.accent }]}>
            <Ionicons name={icon} size={28} color={t.onAccent} />
          </View>
          <View style={[styles.badge, { borderColor: t.border }]}>
            <Text style={[styles.badgeText, { color: t.muted }]}>{tr('common.comingSoon')}</Text>
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
              <Ionicons name={f.icon} size={22} color={t.text} />
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
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  cell: { width: '50%', minWidth: 260, flexGrow: 1, padding: 6 },
  featureCard: { flex: 1 },
});
