import { AD_SPOT_KEY, SPONSOR_STATUSES, type SponsorApplicationView, type SponsorStatus } from '@chessmate/core';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, useLoad } from '@/features/admin/ui';
import { formatDateTime, useT } from '@/i18n';
import { Badge, Button, GlassView, Row, Stack, Text, TextField, useToast } from '@/ui';

/** "Sponsor a tournament" applications: review, note, mark as contacted / accepted / declined. */
export default function AdminSponsors() {
  const tr = useT();
  const { api } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.sponsors(), [api]);
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.sponsors')} subtitle={tr('admin.sponsors.subtitle')} />
      <ErrorLine message={error} />
      {data && data.length === 0 && <EmptyState icon="ribbon-outline" title={tr('admin.sponsors.empty')} body={tr('admin.sponsors.emptyBody')} />}
      <Stack gap="md">
        {data?.map((a) => (
          <SponsorRow key={a.id} a={a} onDone={reload} />
        ))}
      </Stack>
    </AdminPage>
  );
}

function SponsorRow({ a, onDone }: { a: SponsorApplicationView; onDone: () => void }) {
  const tr = useT();
  const { api, can } = useAdmin();
  const toast = useToast();
  const [status, setStatus] = useState<SponsorStatus>(a.status);
  const [note, setNote] = useState(a.staffNote ?? '');
  const [busy, setBusy] = useState(false);
  const [material, setMaterial] = useState(false);
  /** Emails the company the four things a placement needs, and marks it. */
  const askMaterial = async () => {
    setMaterial(true);
    try {
      await api.requestSponsorMaterial(a.id);
      toast.show({ title: tr('admin.sponsors.materialDone'), tone: 'success' });
      onDone();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setMaterial(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.reviewSponsor(a.id, status, note);
      toast.show({ title: tr('admin.common.done'), tone: 'success' });
      onDone();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : tr('admin.common.failed'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <GlassView radius="lg" padding="lg" flat>
      <Stack gap="sm">
        <Row justify="space-between" wrap gap="sm">
          <Text variant="subheading">{a.company ?? a.name}</Text>
          <Badge label={tr(`admin.sponsors.status.${a.status}`)} tone={a.status === 'new' ? 'solid' : a.status === 'declined' ? 'danger' : 'outline'} />
        </Row>
        <Text variant="caption" tone="muted">
          {`${a.name} · ${a.email}${a.website ? ` · ${a.website}` : ''}${a.budget ? ` · ${a.budget}` : ''} · ${formatDateTime(a.createdAt)}`}
        </Text>
        {a.spot ? (
          <Text variant="caption" tone="tertiary">
            {tr('admin.sponsors.spot', { spot: tr(`ads.spot.${AD_SPOT_KEY[a.spot]}`) })}
          </Text>
        ) : null}
        <Text selectable>{a.message}</Text>
        <Segmented<SponsorStatus> size="sm" value={status} onChange={setStatus} options={SPONSOR_STATUSES.map((s) => ({ value: s, label: tr(`admin.sponsors.status.${s}`) }))} />
        <TextField label={tr('admin.common.note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Row gap="sm" wrap>
          <Button size="sm" title={tr('admin.common.save')} loading={busy} onPress={() => void save()} />
          <Button size="sm" variant="secondary" title={tr('admin.sponsors.email')} onPress={() => void Linking.openURL(`mailto:${a.email}?subject=${encodeURIComponent('ChessMate sponsorship')}`)} />
          <Button size="sm" variant="secondary" loading={material} title={tr('admin.sponsors.requestMaterial')} onPress={() => void askMaterial()} />
          {can('ads.manage') ? <Button size="sm" variant="ghost" title={tr('admin.sponsors.place')} onPress={() => router.push('/admin/ads')} /> : null}
        </Row>
        {a.materialRequestedAt ? (
          <Text variant="caption" tone="tertiary">
            {tr('admin.sponsors.materialSent', { date: formatDateTime(a.materialRequestedAt) })}
          </Text>
        ) : null}
        {a.reviewedBy && (
          <Text variant="caption" tone="tertiary">
            {tr('admin.common.reviewedBy', { name: a.reviewedBy })}
          </Text>
        )}
      </Stack>
    </GlassView>
  );
}
