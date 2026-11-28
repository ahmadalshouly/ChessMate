import { formatMoney, type SponsorMessageView, type SponsorPaymentStatus } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';

import { formatDateTime } from '@/i18n';
import type { BadgeTone } from '@/ui/components/Badge';
import { Text, useAppTheme } from '@/ui';

/**
 * The conversation between staff and a sponsor applicant, as chat bubbles.
 * `side` is who is looking: their own messages sit on the end side in the
 * accent colour, the other side's on the start side, and ChessMate's payment
 * lines in the middle.
 */
export function SponsorConversation({ messages, side, names }: { messages: SponsorMessageView[]; side: 'staff' | 'applicant'; names: { mine: string; theirs: string } }) {
  const { colors: c } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      {messages.map((m) => {
        if (m.from === 'system') {
          return (
            <View key={m.id} style={[styles.system, { borderColor: c.border }]}>
              <Text variant="caption" tone="muted" style={{ textAlign: 'center' }} selectable>
                {m.body}
              </Text>
              <Text variant="caption" tone="tertiary" style={{ textAlign: 'center', fontSize: 11 }}>
                {formatDateTime(m.createdAt)}
              </Text>
            </View>
          );
        }
        const mine = m.from === side;
        // Staff see which team member wrote; the company sees "ChessMate team".
        const who = side === 'staff' && mine ? (m.author ?? names.mine) : mine ? names.mine : names.theirs;
        return (
          <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
            <View style={[styles.bubble, mine ? { backgroundColor: c.accent } : { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth }]}>
              <Text selectable color={mine ? c.onAccent : c.text}>
                {m.body}
              </Text>
            </View>
            <Text variant="caption" tone="tertiary" style={{ marginTop: 3, fontSize: 11 }}>
              {`${who} · ${formatDateTime(m.createdAt)}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export const paymentTone = (s: SponsorPaymentStatus): BadgeTone => (s === 'paid' ? 'success' : s === 'open' || s === 'processing' ? 'warning' : s === 'failed' ? 'danger' : 'outline');

export const money = (cents: number, currency: string) => formatMoney(cents, currency);

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  system: { alignSelf: 'center', maxWidth: '90%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
});
