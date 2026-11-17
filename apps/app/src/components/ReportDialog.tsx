import { REPORT_NOTE_MAX, REPORT_REASONS, type PlayerInfo, type ReportReason } from '@chessmate/core';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';

/** Report-a-player sheet: pick a reason, add an optional note, submit. */
export function ReportDialog({
  visible,
  player,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  player: PlayerInfo;
  onClose: () => void;
  onSubmit: (reason: ReportReason, note: string) => Promise<boolean>;
}) {
  const t = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'edit' | 'sending' | 'done' | 'failed'>('edit');

  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setState('edit');
    }
  }, [visible]);

  const submit = async () => {
    if (!reason) return;
    setState('sending');
    setState((await onSubmit(reason, note)) ? 'done' : 'failed');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={30} tint={t.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.center} pointerEvents="box-none">
        <View style={{ width: '100%', maxWidth: 420, borderRadius: 20, backgroundColor: t.surfaceSolid }}>
          <Card>
            {state === 'done' ? (
              <>
                <Label size={18} bold>Report sent</Label>
                <Label muted>{`Thanks. A moderator will review ${player.name}. You can also mute them from the chat panel.`}</Label>
                <Button title="Close" onPress={onClose} />
              </>
            ) : (
              <>
                <Label size={18} bold>{`Report ${player.name}`}</Label>
                <Label muted>What happened? Reports include this game's chat and moves.</Label>
                <View style={{ gap: 6 }}>
                  {REPORT_REASONS.map((r) => {
                    const on = reason === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => setReason(r.id)}
                        style={[styles.option, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent' }]}>
                        <Text style={{ color: on ? t.onAccent : t.text, fontSize: 15 }}>{r.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Details (optional)"
                  placeholderTextColor={t.muted}
                  maxLength={REPORT_NOTE_MAX}
                  multiline
                  style={[styles.note, { color: t.text, borderColor: t.border }]}
                />
                {state === 'failed' && <Label muted>Could not send the report. Try again in a moment.</Label>}
                <View style={styles.row}>
                  <Button variant="secondary" title="Cancel" onPress={onClose} />
                  <Button variant="danger" title={state === 'sending' ? 'Sending...' : 'Send report'} disabled={!reason || state === 'sending'} onPress={submit} />
                </View>
              </>
            )}
          </Card>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  option: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  note: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 70, fontSize: 15, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
