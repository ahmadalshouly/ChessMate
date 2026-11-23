import { PAYOUT_STATUSES, type PayoutRequestView, type PayoutStatus } from '@chessmate/core';
import { router } from 'expo-router';
import { useState } from 'react';

import { Segmented } from '@/components/play/Controls';
import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, EmptyState, ErrorLine, PageHeader, useLoad } from '@/features/admin/ui';
import { formatDateTime, useT } from '@/i18n';
import { Badge, Button, GlassView, Row, Stack, Text, TextField, useToast } from '@/ui';

/** Prize payout requests from tournament winners: review, contact, mark paid or rejected. The winner is notified. */
export default function AdminPayouts() {
  const tr = useT();
  const { api } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.payouts(), [api]);
  return (
    <AdminPage onRefresh={reload} refreshing={loading && !!data}>
      <PageHeader title={tr('admin.nav.payouts')} subtitle={tr('admin.payouts.subtitle')} />
      <ErrorLine message={error} />
      {data && data.length === 0 && <EmptyState icon="cash-outline" title={tr('admin.payouts.empty')} body={tr('admin.payouts.emptyBody')} />}
      <Stack gap="md">
        {data?.map((r) => (
          <PayoutRow key={r.id} r={r} onDone={reload} />
        ))}
      </Stack>
    </AdminPage>
  );
}

function PayoutRow({ r, onDone }: { r: PayoutRequestView; onDone: () => void }) {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [status, setStatus] = useState<PayoutStatus>(r.status);
  const [note, setNote] = useState(r.staffNote ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.reviewPayout(r.id, status, note);
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
          <Text variant="subheading">{`#${r.place} ${r.username} · ${r.prize}`}</Text>
          <Badge label={tr(`admin.payouts.status.${r.status}`)} tone={r.status === 'new' ? 'solid' : r.status === 'rejected' ? 'danger' : 'outline'} />
        </Row>
        <Text variant="caption" tone="muted">
          {`${r.tournamentName} · ${tr(`tournaments.payout.methods.${r.method}`)} · ${formatDateTime(r.createdAt)}`}
        </Text>
        <Text selectable>{r.details}</Text>
        {r.note ? <Text tone="muted">{r.note}</Text> : null}
        <Segmented<PayoutStatus> size="sm" value={status} onChange={setStatus} options={PAYOUT_STATUSES.map((s) => ({ value: s, label: tr(`admin.payouts.status.${s}`) }))} />
        <TextField label={tr('admin.common.note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Row gap="sm" wrap>
          <Button size="sm" title={tr('admin.common.save')} loading={busy} onPress={() => void save()} />
          <Button size="sm" variant="secondary" title={tr('admin.player.message')} onPress={() => router.push({ pathname: '/admin/players/[id]', params: { id: r.userId } })} />
          <Button size="sm" variant="ghost" title={tr('admin.tournaments.monitor')} onPress={() => router.push({ pathname: '/admin/tournaments/[id]', params: { id: r.tournamentId } })} />
        </Row>
        {r.reviewedBy && (
          <Text variant="caption" tone="tertiary">
            {tr('admin.common.reviewedBy', { name: r.reviewedBy })}
          </Text>
        )}
      </Stack>
    </GlassView>
  );
}
