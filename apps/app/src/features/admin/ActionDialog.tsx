import { useEffect, useState, type ReactNode } from 'react';

import { useT } from '@/i18n';
import { Button, Chip, Modal, Row, Stack, Text, TextField, useToast } from '@/ui';

import { ErrorLine } from './ui';

export interface ActionDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Return false (or throw) to keep the dialog open. */
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
  children?: ReactNode;
}

/** Confirm-and-run dialog for every staff action: shows the server's error in place. */
export function ActionDialog({ visible, onClose, title, description, confirmLabel, danger, onConfirm, disabled, children }: ActionDialogProps) {
  const tr = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      toast.show({ title: tr('admin.common.done'), tone: 'success' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('admin.common.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={title}
      description={description}
      actions={
        <>
          <Button variant="ghost" title={tr('admin.common.cancel')} onPress={onClose} />
          <Button variant={danger ? 'danger' : 'primary'} title={confirmLabel} loading={busy} disabled={disabled} onPress={() => void run()} />
        </>
      }>
      <Stack gap="md">
        {children}
        <ErrorLine message={error} />
      </Stack>
    </Modal>
  );
}

/** Single-select chips with a label. */
export function ChoiceField<K extends string>({ label, options, value, onChange }: { label: string; options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <Stack gap="xs">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Row gap="xs" wrap>
        {options.map((o) => (
          <Chip key={o.key} label={o.label} selected={value === o.key} onPress={() => onChange(o.key)} />
        ))}
      </Row>
    </Stack>
  );
}

export function ReasonField({ value, onChange, required, label, multiline }: { value: string; onChange: (v: string) => void; required?: boolean; label?: string; multiline?: boolean }) {
  const tr = useT();
  return (
    <TextField
      label={label ?? (required ? tr('admin.common.reasonRequired') : tr('admin.common.noteOptional'))}
      value={value}
      onChangeText={onChange}
      multiline={multiline}
      maxLength={1000}
    />
  );
}
