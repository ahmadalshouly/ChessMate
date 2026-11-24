import Ionicons from '@expo/vector-icons/Ionicons';
import type { Campaign, PushHealth } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAdmin } from '@/features/admin/AdminContext';
import { STATUS_TONE } from '@/features/admin/campaigns';
import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, StatTile, TileGrid, useLoad } from '@/features/admin/ui';
import { formatAgo, formatDateTime, useT } from '@/i18n';
import { Badge, Button, Row, Stack, Tabs, Text, useAppTheme, useToast } from '@/ui';

type Tab = 'campaigns' | 'triggers' | 'health';


/**
 * Push notifications from the console: one-off sends (now or scheduled),
 * triggers that send on what players do, and whether push actually reaches
 * phones (devices, Expo receipts, credential errors).
 */
export default function AdminNotifications() {
  const tr = useT();
  const { api } = useAdmin();
  const [tab, setTab] = useState<Tab>('campaigns');
  const { data, error, loading, reload } = useLoad(() => api.campaigns(), [api]);
  const all = data?.campaigns ?? [];
  const oneOff = all.filter((c) => c.kind !== 'trigger');
  const triggers = all.filter((c) => c.kind === 'trigger');

  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader
        title={tr('pushAdmin.nav')}
        subtitle={tr('pushAdmin.subtitle')}
        right={<Button size="sm" title={tr('pushAdmin.newCampaign')} onPress={() => router.push({ pathname: '/admin/notifications/[id]', params: { id: 'new', kind: tab === 'triggers' ? 'trigger' : 'instant' } })} />}
      />
      <Tabs items={(['campaigns', 'triggers', 'health'] as Tab[]).map((k) => ({ key: k, label: tr(`pushAdmin.tabs.${k}`) }))} value={tab} onChange={setTab} />
      <ErrorLine message={error} />
      {tab === 'campaigns' && <CampaignList items={oneOff} empty="campaigns" onChange={reload} />}
      {tab === 'triggers' && <CampaignList items={triggers} empty="triggers" onChange={reload} />}
      {tab === 'health' && data && <Health h={data.health} />}
    </AdminPage>
  );
}

function CampaignList({ items, empty, onChange }: { items: Campaign[]; empty: 'campaigns' | 'triggers'; onChange: () => void }) {
  const tr = useT();
  if (!items.length) {
    return (
      <EmptyState
        icon="notifications-outline"
        title={tr(empty === 'campaigns' ? 'pushAdmin.empty.campaigns' : 'pushAdmin.empty.triggers')}
        body={tr(empty === 'campaigns' ? 'pushAdmin.empty.campaignsBody' : 'pushAdmin.empty.triggersBody')}
      />
    );
  }
  return (
    <Stack gap="md">
      {items.map((c) => (
        <CampaignCard key={c.id} c={c} onChange={onChange} />
      ))}
    </Stack>
  );
}

function CampaignCard({ c, onChange }: { c: Campaign; onChange: () => void }) {
  const tr = useT();
  const t = useAppTheme();
  const { api } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const act = async (action: 'launch' | 'pause' | 'resume' | 'cancel' | 'delete') => {
    setBusy(true);
    try {
      await api.campaignAction(c.id, action);
      onChange();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const editable = ['draft', 'scheduled', 'active', 'paused'].includes(c.status);
  const open = () => router.push({ pathname: '/admin/notifications/[id]', params: { id: c.id } });
  const copy = () => router.push({ pathname: '/admin/notifications/[id]', params: { id: 'new', from: c.id } });
  const when =
    c.kind === 'trigger' && c.trigger
      ? tr(`pushAdmin.event.${c.trigger.event}`)
      : c.sentAt
        ? tr('pushAdmin.sentAt', { when: formatDateTime(c.sentAt) })
        : c.scheduleAt
          ? tr('pushAdmin.scheduledFor', { when: formatDateTime(c.scheduleAt) })
          : formatAgo(c.createdAt);

  return (
    <Section title={c.name} action={<Badge label={tr(`pushAdmin.status.${c.status}`)} tone={STATUS_TONE[c.status]} />}>
      <Pressable accessibilityRole="button" onPress={open} style={{ gap: 6 }}>
        <View style={[styles.preview, { backgroundColor: t.colors.surfaceSunken, borderRadius: t.radii.lg }]}>
          <Ionicons name="notifications" size={16} color={t.colors.muted} />
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1}>
              {c.message.title}
            </Text>
            <Text tone="muted" numberOfLines={2}>
              {c.message.body}
            </Text>
          </View>
        </View>
        <Text variant="caption" tone="muted">
          {when} · {tr('pushAdmin.createdBy', { name: c.createdBy })}
        </Text>
        <Text variant="caption" tone="tertiary">
          {tr('pushAdmin.stats', { targeted: c.stats.targeted, pushed: c.stats.pushed, inbox: c.stats.inbox, skipped: c.stats.skipped })}
          {c.stats.failed ? ` · ${tr('pushAdmin.statsFailed', { failed: c.stats.failed })}` : ''}
        </Text>
        {c.lastError ? <ErrorLine message={c.lastError} /> : null}
      </Pressable>
      <Row gap="sm" wrap style={{ marginTop: 12 }}>
        {editable && <Button size="sm" variant="secondary" title={tr('pushAdmin.actions.edit')} onPress={open} />}
        {c.status === 'active' && <Button size="sm" variant="secondary" loading={busy} title={tr('pushAdmin.actions.pause')} onPress={() => void act('pause')} />}
        {c.status === 'paused' && <Button size="sm" loading={busy} title={tr('pushAdmin.actions.resume')} onPress={() => void act('resume')} />}
        {(c.status === 'scheduled' || c.status === 'active' || c.status === 'paused') && (
          <Button size="sm" variant="ghost" loading={busy} title={tr('pushAdmin.actions.cancel')} onPress={() => void act('cancel')} />
        )}
        <Button size="sm" variant="ghost" title={tr('pushAdmin.actions.duplicate')} onPress={copy} />
        {c.status !== 'sending' &&
          (confirmDelete ? (
            <Button size="sm" variant="danger" loading={busy} title={tr('pushAdmin.actions.deleteConfirm')} onPress={() => void act('delete')} />
          ) : (
            <Button size="sm" variant="ghost" title={tr('pushAdmin.actions.delete')} onPress={() => setConfirmDelete(true)} />
          ))}
      </Row>
    </Section>
  );
}

function Health({ h }: { h: PushHealth }) {
  const tr = useT();
  const devices = Object.values(h.devices).reduce((a, b) => a + b, 0);
  return (
    <Stack gap="lg">
      {!h.sending && <ErrorLine message={tr('pushAdmin.health.notSending')} />}
      <TileGrid>
        <StatTile label={tr('pushAdmin.health.devices')} value={devices} hint={Object.entries(h.devices).map(([p, n]) => `${p} ${n}`).join(' · ') || undefined} icon="phone-portrait-outline" />
        <StatTile label={tr('pushAdmin.health.players')} value={h.players} icon="people-outline" />
        <StatTile label={tr('pushAdmin.health.accepted')} value={h.totals.accepted} hint={tr('pushAdmin.health.sinceStart')} icon="paper-plane-outline" />
        <StatTile label={tr('pushAdmin.health.delivered')} value={h.totals.delivered} hint={tr('pushAdmin.health.sinceStart')} tone="success" icon="checkmark-done-outline" />
        <StatTile label={tr('pushAdmin.health.failed')} value={h.totals.failed} tone={h.totals.failed ? 'danger' : undefined} icon="alert-circle-outline" />
      </TileGrid>
      <Section title={tr('pushAdmin.health.errors')}>
        {h.errors.length === 0 ? (
          <Text tone="muted">{tr('pushAdmin.health.noErrors')}</Text>
        ) : (
          <Stack gap="md">
            {h.errors.map((e) => (
              <View key={`${e.code}:${e.platform}`} style={{ gap: 2 }}>
                <Row gap="sm">
                  <Badge label={e.code} tone="danger" />
                  {e.platform ? <Badge label={e.platform} tone="outline" /> : null}
                  <Text variant="caption" tone="muted">
                    {tr('pushAdmin.health.count', { count: e.count })} · {formatAgo(e.at)}
                  </Text>
                </Row>
                <Text tone="muted">{e.message}</Text>
              </View>
            ))}
          </Stack>
        )}
      </Section>
      <Section title={tr('pushAdmin.health.setupTitle')}>
        <Stack gap="md">
          <Text>
            <Text variant="label">{tr('pushAdmin.health.token')}: </Text>
            <Text tone="muted">{h.accessToken ? tr('pushAdmin.health.tokenSet') : tr('pushAdmin.health.tokenNotSet')}</Text>
          </Text>
          <Text tone="muted">{tr('pushAdmin.health.setupBody')}</Text>
        </Stack>
      </Section>
    </Stack>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'flex-start' },
});
