import type { StreamerApplicationView } from '@chessmate/core';
import { useState } from 'react';

import { AdminPage, EmptyState, ErrorLine, PageHeader, Section, useLoad } from '@/features/admin/ui';
import { StreamerCard, openLink } from '@/features/watch/components';
import { formatAgo, useT } from '@/i18n';
import { watchApi } from '@/lib/watchApi';
import { Badge, Button, Row, Stack, Tabs, Text, TextField, useAppTheme } from '@/ui';

type Tab = 'pending' | 'approved' | 'rejected' | 'streamers';
const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

/** Staff: review streamer applications and manage approved streamers. */
export default function AdminStreamers() {
  const tr = useT();
  const t = useAppTheme();
  const [tab, setTab] = useState<Tab>('pending');
  const apps = useLoad(() => (tab === 'streamers' ? Promise.resolve([] as StreamerApplicationView[]) : watchApi.streamerApplications(tab)), [tab]);
  const streamers = useLoad(() => (tab === 'streamers' ? watchApi.streamers() : Promise.resolve([])), [tab]);
  return (
    <AdminPage>
      <PageHeader title={tr('watch.admin.streamers')} subtitle={tr('watch.admin.streamersSubtitle')} />
      <Tabs items={(['pending', 'approved', 'rejected', 'streamers'] as Tab[]).map((k) => ({ key: k, label: k === 'streamers' ? tr('watch.streamers') : tr(`watch.applicationStatus.${k}`) }))} value={tab} onChange={setTab} />
      <ErrorLine message={apps.error ?? streamers.error} />
      {tab === 'streamers' ? (
        streamers.data && streamers.data.length === 0 ? (
          <EmptyState icon="videocam-outline" title={tr('watch.noStreamers')} />
        ) : (
          <Stack gap="md" style={{ marginTop: t.space.sm }}>
            {(streamers.data ?? []).map((s) => (
              <Stack key={s.userId} gap="xs">
                <StreamerCard s={s} />
                <RemoveStreamer userId={s.userId} onDone={streamers.reload} />
              </Stack>
            ))}
          </Stack>
        )
      ) : apps.data && apps.data.length === 0 ? (
        <EmptyState icon="mail-open-outline" title={tr('watch.admin.noApplications')} />
      ) : (
        <Stack gap="md" style={{ marginTop: t.space.sm }}>
          {(apps.data ?? []).map((a) => (
            <ApplicationCard key={a.id} a={a} onDone={apps.reload} />
          ))}
        </Stack>
      )}
    </AdminPage>
  );
}

function RemoveStreamer({ userId, onDone }: { userId: string; onDone: () => void }) {
  const tr = useT();
  const [armed, setArmed] = useState(false);
  return (
    <Button
      title={armed ? tr('watch.manage.confirmRemove') : tr('watch.admin.removeStreamer')}
      variant={armed ? 'danger' : 'ghost'}
      size="sm"
      onPress={() => {
        if (!armed) return setArmed(true);
        watchApi.removeStreamer(userId).then(onDone, () => setArmed(false));
      }}
    />
  );
}

function ApplicationCard({ a, onDone }: { a: StreamerApplicationView; onDone: () => void }) {
  const tr = useT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await watchApi.reviewStreamer(a.id, approve, note.trim() || undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={`${a.displayName} (@${a.username})`}>
      <Stack gap="sm">
        <Row gap="sm" wrap>
          <Badge label={tr(`watch.applicationStatus.${a.status}`)} tone={TONE[a.status]} />
          <Text variant="caption" tone="muted">
            {formatAgo(a.createdAt)}
          </Text>
        </Row>
        <Text selectable>{a.about}</Text>
        {a.channels.map((c) => (
          <Button key={c.url} title={`${tr(`watch.platforms.${c.platform}`)}: ${c.url}`} variant="ghost" size="sm" onPress={() => openLink(c.url)} />
        ))}
        {a.note ? <Text variant="caption">{a.note}</Text> : null}
        {a.status === 'pending' && (
          <>
            <TextField value={note} onChangeText={setNote} placeholder={tr('watch.admin.note')} maxLength={500} accessibilityLabel={tr('watch.admin.note')} />
            {error && <Text tone="danger">{error}</Text>}
            <Row gap="sm">
              <Button title={tr('watch.admin.approve')} size="sm" loading={busy} onPress={() => void review(true)} />
              <Button title={tr('watch.admin.reject')} variant="secondary" size="sm" loading={busy} onPress={() => void review(false)} />
            </Row>
          </>
        )}
      </Stack>
    </Section>
  );
}
