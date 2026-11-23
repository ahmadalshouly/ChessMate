import { CHAT_MAX_LENGTH, type TournamentChatMessage } from '@chessmate/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { formatAgo, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { Badge, Button, GlassView, Text, TextField, useAppTheme } from '@/ui';

/**
 * The tournament chat: the latest messages (newest at the bottom) and a box
 * to write in. Used on the tournament page and in the admin monitor, which
 * passes `actions` to hide messages and sees hidden ones dimmed.
 */
export function TournamentChat({
  messages,
  meId,
  onSend,
  disabledReason,
  placeholder,
  actions,
}: {
  messages: TournamentChatMessage[];
  meId?: string | null;
  /** Sends a message; rejects with the server's error. Omit to only read. */
  onSend?: (text: string) => Promise<void>;
  /** Shown instead of the box when the viewer cannot write (signed out, ...). */
  disabledReason?: ReactNode;
  placeholder?: string;
  /** Extra controls per message (staff: hide or show). */
  actions?: (m: TournamentChatMessage) => ReactNode;
}) {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const last = messages[messages.length - 1]?.id;

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: false });
  }, [last]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !onSend) return;
    setBusy(true);
    try {
      await onSend(text);
      setDraft('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassView padding="md" radius="xl" style={{ gap: t.space.sm }}>
      <ScrollView ref={scroll} style={styles.list} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} nestedScrollEnabled>
        {messages.length === 0 ? (
          <Text tone="muted">{tr('tournaments.chat.empty')}</Text>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[styles.line, m.hidden && { opacity: 0.5 }]}>
              <View style={styles.head}>
                <Text variant="label" style={m.userId === meId ? { color: c.accent } : undefined}>
                  {m.username}
                </Text>
                {m.staff && <Badge size="sm" tone="solid" label={tr('tournaments.chat.staff')} />}
                {m.hidden && <Badge size="sm" tone="danger" label={m.hiddenBy ? tr('tournaments.chat.hiddenBy', { name: m.hiddenBy }) : tr('tournaments.chat.hidden')} />}
                <Text variant="caption" tone="muted">
                  {formatAgo(m.at)}
                </Text>
                {actions && <View style={styles.actions}>{actions(m)}</View>}
              </View>
              <Text style={m.hidden ? { textDecorationLine: 'line-through' } : undefined}>{m.text}</Text>
            </View>
          ))
        )}
      </ScrollView>
      {onSend ? (
        <View style={styles.row}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void send()}
            placeholder={placeholder ?? tr('tournaments.chat.placeholder')}
            maxLength={CHAT_MAX_LENGTH}
            returnKeyType="send"
            containerStyle={{ flex: 1 }}
            accessibilityLabel={tr('tournaments.chat.title')}
          />
          <Button title={tr('common.send')} onPress={() => void send()} disabled={busy || !draft.trim()} loading={busy} />
        </View>
      ) : (
        disabledReason
      )}
      {error && <Text tone="danger">{serverText(error)}</Text>}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 320 },
  line: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actions: { marginStart: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
