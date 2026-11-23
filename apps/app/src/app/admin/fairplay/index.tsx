import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminFairPlayCase } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, ScoreMeter, Section, useLoad } from '@/features/admin/ui';
import { dirIcon, formatAgo, translateOr, useT } from '@/i18n';
import { Badge, Button, Row, Stack, Tabs, Text, useAppTheme } from '@/ui';

type Tab = 'open' | 'dismissed' | 'banned';

export default function AdminFairPlay() {
  const tr = useT();
  const { api } = useAdmin();
  const [tab, setTab] = useState<Tab>('open');
  const { data, error, loading, reload } = useLoad(() => api.fairPlay(tab), [api, tab]);
  const cases = data ?? [];
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.fairplay')} subtitle={tr('admin.fairplay.subtitle')} right={<Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />} />
      <Tabs items={(['open', 'dismissed', 'banned'] as const).map((k) => ({ key: k, label: tr(`admin.fairplay.tabs.${k}`) }))} value={tab} onChange={setTab} />
      <ErrorLine message={error} />
      <Section title={tr(`admin.fairplay.tabs.${tab}`)} padding="none">
        {data && cases.length === 0 ? <EmptyState icon="shield-checkmark-outline" title={tr('admin.fairplay.empty')} /> : cases.map((c, i) => <CaseRow key={c.playerId} c={c} last={i === cases.length - 1} />)}
      </Section>
    </AdminPage>
  );
}

function CaseRow({ c: fc, last }: { c: AdminFairPlayCase; last: boolean }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const a = fc.assessment;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/admin/fairplay/${encodeURIComponent(fc.playerId)}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        (pressed || hovered) && { backgroundColor: c.surfaceSunken },
      ]}>
      <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{fc.username}</Text>
        <Row gap="xs" wrap>
          {fc.reasons.map((r) => (
            <Badge key={r} label={translateOr(`admin.fairplay.reasons.${r}`, r)} tone="outline" />
          ))}
          {fc.cheatingReports > 0 && <Badge label={tr('admin.fairplay.cheatingReports', { count: fc.cheatingReports })} tone="warning" />}
        </Row>
        <Text variant="caption" tone="muted">
          {[a ? tr('admin.fairplay.games', { count: a.games }) : null, a ? `${tr('admin.fairplay.accuracyZ')} ${a.accuracyZ.toFixed(1)}` : null, a ? `${tr('admin.fairplay.matchZ')} ${a.matchZ.toFixed(1)}` : null, formatAgo(fc.updatedAt)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Stack>
      <ScoreMeter score={fc.score} />
      <Ionicons name={dirIcon('chevron-forward')} size={14} color={c.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
});
