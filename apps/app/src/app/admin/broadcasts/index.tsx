import type { EventApplicationView, EventSummary } from '@chessmate/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { EventCard, dateRange } from '@/features/watch/components';
import { formatAgo, useT } from '@/i18n';
import { watchApi } from '@/lib/watchApi';
import { Badge, Button, Row, Stack, Switch, Tabs, Text, TextField, useAppTheme } from '@/ui';

type Tab = 'events' | 'applications' | 'settings';

/** Admin: every broadcast event, organiser applications and import settings. */
export default function AdminBroadcasts() {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('events');
  return (
    <AdminPage>
      <PageHeader title={tr('watch.admin.broadcasts')} subtitle={tr('watch.admin.broadcastsSubtitle')} right={<Button title={tr('watch.manage.newTitle')} size="sm" onPress={() => router.push('/watch/manage/new')} />} />
      <Tabs items={(['events', 'applications', 'settings'] as Tab[]).map((k) => ({ key: k, label: tr(`watch.admin.tabs.${k}`) }))} value={tab} onChange={setTab} />
      {tab === 'events' && <EventsTab />}
      {tab === 'applications' && <ApplicationsTab />}
      {tab === 'settings' && <SettingsTab />}
    </AdminPage>
  );
}

function EventsTab() {
  const tr = useT();
  const t = useAppTheme();
  const { data, error, loading, reload } = useLoad(() => watchApi.allEvents(), []);
  const [q, setQ] = useState('');
  const list = (data ?? []).filter((e: EventSummary) => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <ErrorLine message={error} />
      <Row gap="sm">
        <TextField containerStyle={{ flex: 1 }} value={q} onChangeText={setQ} placeholder={tr('watch.admin.search')} accessibilityLabel={tr('watch.admin.search')} />
        <Button title={tr('admin.common.refresh')} variant="secondary" size="sm" loading={loading} onPress={reload} />
      </Row>
      {data && list.length === 0 ? (
        <EmptyState icon="tv-outline" title={tr('watch.noEvents')} />
      ) : (
        <Stack gap="md" style={{ marginTop: t.space.sm }}>
          {list.map((e) => (
            <EventCard key={e.id} e={e} onPress={() => router.push(`/watch/manage/${e.id}`)} />
          ))}
        </Stack>
      )}
    </>
  );
}

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

function ApplicationsTab() {
  const tr = useT();
  const t = useAppTheme();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const { data, error, reload } = useLoad(() => watchApi.eventApplications(status), [status]);
  return (
    <>
      <Tabs variant="underline" items={(['pending', 'approved', 'rejected'] as const).map((k) => ({ key: k, label: tr(`watch.applicationStatus.${k}`) }))} value={status} onChange={setStatus} />
      <ErrorLine message={error} />
      {data && data.length === 0 ? (
        <EmptyState icon="mail-open-outline" title={tr('watch.admin.noApplications')} />
      ) : (
        <Stack gap="md" style={{ marginTop: t.space.sm }}>
          {(data ?? []).map((a) => (
            <ApplicationCard key={a.id} a={a} onDone={reload} />
          ))}
        </Stack>
      )}
    </>
  );
}

function ApplicationCard({ a, onDone }: { a: EventApplicationView; onDone: () => void }) {
  const tr = useT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await watchApi.reviewEvent(a.id, approve, note.trim() || undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={a.eventName}>
      <Stack gap="sm">
        <Row gap="sm" wrap>
          <Badge label={tr(`watch.applicationStatus.${a.status}`)} tone={TONE[a.status]} />
          <Text variant="caption" tone="muted">
            {[`@${a.username}`, a.organization, a.location, dateRange(a.startsAt, a.endsAt), formatAgo(a.createdAt)].join(' · ')}
          </Text>
        </Row>
        <Text selectable>{a.description}</Text>
        {a.coverage ? (
          <Text variant="caption" tone="muted">
            {tr('watch.apply.coverage')}: {a.coverage}
          </Text>
        ) : null}
        {a.website ? (
          <Text variant="caption" tone="muted" selectable>
            {a.website}
          </Text>
        ) : null}
        {a.note ? <Text variant="caption">{a.note}</Text> : null}
        {a.status === 'pending' ? (
          <>
            <TextField value={note} onChangeText={setNote} placeholder={tr('watch.admin.note')} maxLength={500} accessibilityLabel={tr('watch.admin.note')} />
            {error && <Text tone="danger">{error}</Text>}
            <Row gap="sm">
              <Button title={tr('watch.admin.approve')} size="sm" loading={busy} onPress={() => void review(true)} />
              <Button title={tr('watch.admin.reject')} variant="secondary" size="sm" loading={busy} onPress={() => void review(false)} />
            </Row>
          </>
        ) : (
          a.eventId && <Button title={tr('watch.manage.open')} variant="secondary" size="sm" onPress={() => router.push(`/watch/manage/${a.eventId}`)} />
        )}
      </Stack>
    </Section>
  );
}

function SettingsTab() {
  const tr = useT();
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    watchApi.settings().then((s) => setOn(s.lichessImport), (e: Error) => setError(e.message));
  }, []);
  return (
    <Section title={tr('watch.admin.importTitle')}>
      <Stack gap="sm">
        <Row justify="space-between" gap="md">
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text>{tr('watch.admin.lichessImport')}</Text>
            <Text variant="caption" tone="muted">
              {tr('watch.admin.lichessImportHint')}
            </Text>
          </Stack>
          <Switch
            value={!!on}
            disabled={on === null}
            accessibilityLabel={tr('watch.admin.lichessImport')}
            onValueChange={(v) => {
              setOn(v);
              watchApi.saveSettings({ lichessImport: v }).then(
                (s) => setOn(s.lichessImport),
                (e: Error) => {
                  setOn(!v);
                  setError(e.message);
                },
              );
            }}
          />
        </Row>
        <ErrorLine message={error} />
      </Stack>
    </Section>
  );
}
