import { MESSAGE_MAX } from '@chessmate/core';
import { useState } from 'react';

import { useAdmin } from '@/features/admin/AdminContext';
import { AdminPage, ErrorLine, PageHeader, Section } from '@/features/admin/ui';
import { useT } from '@/i18n';
import { Button, Stack, Text, TextField, useToast } from '@/ui';

/**
 * Announcements: one message to every player, delivered to their Messages
 * under "ChessMate team". Messages to one player are sent from their page.
 */
export default function AdminMessages() {
  const tr = useT();
  const { api } = useAdmin();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.broadcast(body.trim());
      toast.show({ title: tr('admin.messages.sent', { count: r.sent }), tone: 'success' });
      setBody('');
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage>
      <PageHeader title={tr('admin.nav.messages')} subtitle={tr('admin.messages.subtitle')} />
      <Section title={tr('admin.messages.announcement')} index={1}>
        <Stack gap="md">
          <TextField label={tr('admin.dialogs.message')} value={body} onChangeText={setBody} multiline maxLength={MESSAGE_MAX} />
          <Text variant="caption" tone="muted">
            {tr('admin.messages.hint', { n: body.length, max: MESSAGE_MAX })}
          </Text>
          <ErrorLine message={error} />
          {confirm ? (
            <Stack gap="sm">
              <Text variant="label">{tr('admin.messages.confirm')}</Text>
              <Button title={tr('admin.messages.sendAll')} variant="danger" loading={busy} onPress={() => void send()} />
              <Button title={tr('admin.common.cancel')} variant="ghost" onPress={() => setConfirm(false)} />
            </Stack>
          ) : (
            <Button title={tr('admin.messages.review')} disabled={!body.trim()} onPress={() => setConfirm(true)} />
          )}
        </Stack>
      </Section>
      <Section title={tr('admin.messages.onePlayer')} index={2}>
        <Text tone="muted">{tr('admin.messages.onePlayerBody')}</Text>
      </Section>
    </AdminPage>
  );
}
