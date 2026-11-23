import Ionicons from '@expo/vector-icons/Ionicons';
import type { AdminTitleApplication } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { TITLE_STATUS_TONE, TitleBadge } from '@/features/titles/TitleBadge';
import { dirIcon, formatAgo, useT } from '@/i18n';
import { Badge, Button, Row, Stack, Tabs, Text, useAppTheme } from '@/ui';

const TABS = ['pending', 'approved', 'rejected', 'withdrawn', 'all'] as const;
type Tab = (typeof TABS)[number];

export default function AdminTitles() {
  const tr = useT();
  const { api } = useAdmin();
  const [tab, setTab] = useState<Tab>('pending');
  const { data, error, loading, reload } = useLoad(() => api.titles(tab), [api, tab]);
  const apps = data ?? [];
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.titles')} subtitle={tr('admin.titles.subtitle')} right={<Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />} />
      <Tabs items={TABS.map((k) => ({ key: k, label: tr(`admin.titles.tabs.${k}`) }))} value={tab} onChange={setTab} />
      <ErrorLine message={error} />
      <Section title={tr(`admin.titles.tabs.${tab}`)} padding="none">
        {data && apps.length === 0 ? <EmptyState icon="ribbon-outline" title={tr('admin.titles.empty')} /> : apps.map((a, i) => <ApplicationRow key={a.id} a={a} last={i === apps.length - 1} />)}
      </Section>
    </AdminPage>
  );
}

function ApplicationRow({ a, last }: { a: AdminTitleApplication; last: boolean }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/admin/titles/${encodeURIComponent(a.id)}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
        (pressed || hovered) && { backgroundColor: c.surfaceSunken },
      ]}>
      <TitleBadge title={a.title} size="md" />
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Row gap="xs" wrap>
          <Text variant="bodyStrong">{a.username}</Text>
          <Text tone="muted" numberOfLines={1}>
            {a.fullName}
          </Text>
        </Row>
        <Text variant="caption" tone="muted">
          {[tr('admin.titles.applied', { when: formatAgo(a.createdAt) }), tr('admin.titles.files', { count: a.documents.length }), a.fideId ? `FIDE ${a.fideId}` : null, a.federation].filter(Boolean).join(' · ')}
        </Text>
      </Stack>
      <Row gap="xs">
        {a.fairPlay === 'open' || a.fairPlay === 'banned' ? <Badge label={tr('admin.nav.fairplay')} tone="warning" /> : null}
        {a.playerClosed && <Badge label={tr('admin.status.closed')} tone="danger" />}
        <Badge label={tr(`admin.titles.tabs.${a.status}`)} tone={TITLE_STATUS_TONE[a.status]} />
      </Row>
      <Ionicons name={dirIcon('chevron-forward')} size={14} color={c.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
});
