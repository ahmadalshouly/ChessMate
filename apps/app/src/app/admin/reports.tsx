import type { AdminReport, ReportAction } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, useLoad } from '@/features/admin/ui';
import { formatAgo, formatDateTime, translateOr, useT } from '@/i18n';
import { Badge, Button, GlassView, Row, Stack, Tabs, Text, useAppTheme, useToast } from '@/ui';

type Tab = 'open' | 'actioned' | 'dismissed' | 'all';

export default function AdminReports() {
  const tr = useT();
  const { api } = useAdmin();
  const [tab, setTab] = useState<Tab>('open');
  const { data, error, loading, reload } = useLoad(() => api.reports(tab), [api, tab]);
  const reports = data ?? [];
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.reports')} subtitle={tr('admin.reports.subtitle')} right={<Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />} />
      <Tabs
        items={(['open', 'actioned', 'dismissed', 'all'] as const).map((k) => ({ key: k, label: tr(`admin.reports.tabs.${k}`), count: k === tab && data ? reports.length : undefined }))}
        value={tab}
        onChange={setTab}
      />
      <ErrorLine message={error} />
      {data && reports.length === 0 && <EmptyState icon="checkmark-done-outline" title={tr('admin.reports.empty')} />}
      <Stack gap="md">
        {reports.map((r) => (
          <ReportCard key={r.id} r={r} onDone={reload} />
        ))}
      </Stack>
    </AdminPage>
  );
}

function ReportCard({ r, onDone }: { r: AdminReport; onDone: () => void }) {
  const tr = useT();
  const { colors: c } = useAppTheme();
  const { api, can } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: ReportAction, hours?: number) => {
    setBusy(`${action}${hours ?? ''}`);
    try {
      await api.resolveReport(r.id, action, { hours });
      toast.show({ title: tr(`admin.reports.actions.${action}`), message: r.targetName, tone: 'success' });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <GlassView radius="lg" padding="lg" flat>
      <Stack gap="md">
        <Row justify="space-between" align="flex-start" wrap gap="sm">
          <Stack gap="xxs" style={{ flex: 1, minWidth: 220 }}>
            <Row gap="sm" wrap>
              <Text variant="subheading">{r.targetName}</Text>
              <Badge label={translateOr(`report.reasons.${r.reason}`, r.reason)} tone={r.reason === 'cheating' ? 'warning' : 'outline'} />
              {r.targetChatBan && <Badge label={tr('admin.status.muted')} tone="warning" />}
            </Row>
            <Text variant="caption" tone="muted">
              {[
                tr('admin.reports.reportedBy', { name: r.reporterName, when: formatAgo(r.createdAt) }),
                r.gameId ? tr('admin.reports.game', { id: r.gameId }) : null,
                r.targetReportCount && r.targetReportCount > 1 ? tr('admin.reports.repeat', { count: r.targetReportCount }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Stack>
          <Badge label={tr(`admin.reports.tabs.${r.status}`)} tone={r.status === 'open' ? 'solid' : 'neutral'} />
        </Row>
        {!!r.note && <Text>{`“${r.note}”`}</Text>}
        {r.chat.length > 0 && (
          <Stack gap="xs">
            <Text variant="overline" tone="tertiary">
              {tr('admin.reports.chat')}
            </Text>
            <View style={[styles.log, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
              {r.chat.slice(-30).map((l) => (
                <Text key={l.id} variant="caption" color={l.playerId === r.targetId ? c.text : c.muted} style={l.playerId === r.targetId ? { fontWeight: '600' } : undefined}>
                  {`${l.name}: ${l.text}${l.filtered ? `  [${tr('admin.reports.filtered')}]` : ''}`}
                </Text>
              ))}
            </View>
          </Stack>
        )}
        {r.moves.length > 0 && (
          <Text variant="mono" tone="muted" numberOfLines={2}>
            {`${tr('admin.reports.moves', { count: r.moves.length })}: ${r.moves.slice(0, 40).join(' ')}${r.moves.length > 40 ? ' …' : ''}`}
          </Text>
        )}
        {r.resolution ? (
          <Text variant="caption" tone="muted">
            {tr('admin.reports.resolved', { action: tr(`admin.reports.actions.${r.resolution.action}`), by: r.resolution.by, when: formatDateTime(r.resolution.at) })}
            {r.resolution.note ? ` · ${r.resolution.note}` : ''}
          </Text>
        ) : (
          can('reports.resolve') && (
            <Row gap="sm" wrap>
              <Button size="sm" variant="secondary" title={tr('admin.reports.dismiss')} loading={busy === 'dismiss'} onPress={() => void act('dismiss')} />
              <Button size="sm" variant="secondary" title={tr('admin.reports.warn')} loading={busy === 'warn'} onPress={() => void act('warn')} />
              {can('players.mute') && <Button size="sm" variant="danger" title={tr('admin.reports.mute24')} loading={busy === 'chat_ban24'} onPress={() => void act('chat_ban', 24)} />}
              {can('players.mute') && <Button size="sm" variant="danger" title={tr('admin.reports.mute7d')} loading={busy === 'chat_ban168'} onPress={() => void act('chat_ban', 168)} />}
              <Button size="sm" variant="ghost" title={tr('admin.reports.openPlayer')} onPress={() => router.push(`/admin/players/${encodeURIComponent(r.targetId)}`)} />
            </Row>
          )
        )}
        <ErrorLine message={error} />
      </Stack>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  log: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 3 },
});
