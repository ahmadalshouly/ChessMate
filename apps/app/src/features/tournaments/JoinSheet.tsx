import { formatMoney, type TournamentDetail } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '@/i18n';
import { Button, Modal, Text, useAppTheme } from '@/ui';

/**
 * Join step: the arena rules and the organisers' own rules, which the player
 * must accept. For paid tournaments the button says what they will pay.
 */
export function JoinSheet({
  tournament,
  visible,
  busy,
  onClose,
  onAccept,
}: {
  tournament: TournamentDetail;
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const [accepted, setAccepted] = useState(false);
  const fee = tournament.entryFeeCents > 0 ? formatMoney(tournament.entryFeeCents, tournament.currency) : null;
  const standard = [
    tr('tournaments.rules.pairing'),
    tr('tournaments.rules.points'),
    tr('tournaments.rules.fairPlay'),
    tr('tournaments.rules.conduct'),
    tr('tournaments.rules.pause'),
    ...(fee ? [tr('tournaments.rules.fee', { fee })] : []),
    ...(tournament.prizes.length || tournament.prizePool ? [tr('tournaments.rules.prizes')] : []),
  ];
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      presentation="sheet"
      title={tr('tournaments.rules.title', { name: tournament.name })}
      actions={
        <>
          <Button variant="ghost" title={tr('admin.common.cancel')} onPress={onClose} />
          <Button title={fee ? tr('tournaments.payAndJoin', { fee }) : tr('tournaments.join')} disabled={!accepted || busy} loading={busy} onPress={onAccept} />
        </>
      }>
      <View style={{ gap: 8 }}>
        {standard.map((line, i) => (
          <View key={i} style={styles.line}>
            <Ionicons name="checkmark-circle-outline" size={16} color={c.muted} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1 }}>{line}</Text>
          </View>
        ))}
      </View>
      {tournament.rules ? (
        <View style={[styles.custom, { borderColor: c.border, backgroundColor: c.surfaceSunken }]}>
          <Text variant="label">{tr('tournaments.rules.organiser')}</Text>
          <Text>{tournament.rules}</Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((a) => !a)} style={styles.accept}>
        <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={22} color={accepted ? c.accent : c.text} />
        <Text variant="label" style={{ flex: 1 }}>
          {tr('tournaments.rules.accept')}
        </Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  custom: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 6 },
  accept: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
