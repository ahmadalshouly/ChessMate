import { PAYOUT_METHODS, type PayoutMethod } from '@chessmate/core';
import { useState } from 'react';

import { Segmented } from '@/components/play/Controls';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { Button, Modal, Text, TextField } from '@/ui';

/** A prize winner asks for their prize: how to be paid and the details. Staff review it and get in touch. */
export function PayoutSheet({
  visible,
  place,
  prize,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  place: number;
  prize: string;
  onClose: () => void;
  onSubmit: (body: { method: PayoutMethod; details: string; note: string | null }) => Promise<void>;
}) {
  const tr = useT();
  const [method, setMethod] = useState<PayoutMethod>('paypal');
  const [details, setDetails] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ method, details: details.trim(), note: note.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      presentation="sheet"
      title={tr('tournaments.payout.title')}
      description={tr('tournaments.payout.body', { place, prize })}
      actions={
        <>
          <Button variant="ghost" title={tr('admin.common.cancel')} onPress={onClose} />
          <Button title={tr('tournaments.payout.submit')} loading={busy} disabled={details.trim().length < 4} onPress={() => void submit()} />
        </>
      }>
      <Segmented<PayoutMethod> value={method} onChange={setMethod} options={PAYOUT_METHODS.map((m) => ({ value: m, label: tr(`tournaments.payout.methods.${m}`) }))} />
      <TextField label={tr(`tournaments.payout.details.${method}`)} value={details} onChangeText={setDetails} autoCapitalize="none" multiline={method !== 'paypal'} maxLength={500} />
      <TextField label={tr('tournaments.payout.note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <Text variant="caption" tone="muted">
        {tr('tournaments.payout.privacy')}
      </Text>
      {error && (
        <Text variant="caption" tone="danger">
          {serverText(error)}
        </Text>
      )}
    </Modal>
  );
}
