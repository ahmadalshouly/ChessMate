import { CHAT_MAX_LENGTH, QUICK_MESSAGES, type PlayerInfo } from '@chessmate/core';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text, TextInput } from '@/ui/primitives';

import { ReportDialog } from '@/components/ReportDialog';
import { Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { setChatOff, setMuted, useChatPrefs, type GameChat } from '@/lib/useGameChat';
import { translateOr, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';

/** Quick messages are sent as ids, so each player reads them in their own language. */
export const quickText = (id: string, fallback: string) => translateOr(`chat.quick.${id}`, fallback);

/**
 * In-game chat: quick-message chips, free text (filtered by the server),
 * mute and report for the opponent, and a switch to turn chat off.
 */
export function ChatPanel({ chat, me, opponent, canChat }: { chat: GameChat; me: PlayerInfo | null; opponent: PlayerInfo | null; canChat: boolean }) {
  const t = useTheme();
  const tr = useT();
  const prefs = useChatPrefs();
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const isMuted = !!opponent && prefs.muted.has(opponent.id);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [chat.lines.length]);

  const submit = () => {
    if (chat.sendText(draft)) setDraft('');
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <View style={styles.header}>
        <Label bold>{tr('chat.title')}</Label>
        <View style={styles.headerActions}>
          {opponent && (
            <>
              <Chip label={isMuted ? tr('chat.unmute') : tr('chat.mute')} active={isMuted} onPress={() => setMuted(opponent.id, !isMuted)} />
              <Chip label={reported ? tr('chat.reported') : tr('chat.report')} disabled={reported} onPress={() => setReporting(true)} />
            </>
          )}
          <Chip label={prefs.chatOff ? tr('chat.off') : tr('chat.on')} active={prefs.chatOff} onPress={() => setChatOff(!prefs.chatOff)} />
        </View>
      </View>

      <ScrollView ref={scroll} style={[styles.log, { borderColor: t.border }]} contentContainerStyle={{ padding: 10, gap: 6 }}>
        {chat.lines.length === 0 && <Label muted>{prefs.chatOff ? tr('chat.offHint') : tr('chat.empty')}</Label>}
        {chat.lines.map((l) => {
          const mine = l.playerId === me?.id;
          return (
            <View key={l.id} style={[styles.bubble, mine ? { alignSelf: 'flex-end', backgroundColor: t.accent } : { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.glassBorder, borderWidth: 1 }]}>
              {!mine && <Text style={[styles.name, { color: t.muted }]}>{l.name}</Text>}
              <Text style={{ color: mine ? t.onAccent : t.text, fontSize: 15 }}>{l.quick ? quickText(l.quick, l.text) : l.text}</Text>
            </View>
          );
        })}
        {chat.hiddenCount > 0 && !prefs.chatOff && <Label muted>{tr('chat.hidden', { count: chat.hiddenCount })}</Label>}
      </ScrollView>

      {chat.notice && <Label muted>{serverText(chat.notice)}</Label>}

      {canChat && !prefs.chatOff && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {QUICK_MESSAGES.map((q) => (
              <Chip key={q.id} label={quickText(q.id, q.text)} onPress={() => chat.sendQuick(q.id)} />
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              placeholder={tr('chat.placeholder')}
              placeholderTextColor={t.muted}
              maxLength={CHAT_MAX_LENGTH}
              returnKeyType="send"
              accessibilityLabel={tr('chat.a11y')}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
            />
            <Pressable accessibilityRole="button" onPress={submit} disabled={!draft.trim()} style={[styles.send, { backgroundColor: t.accent, opacity: draft.trim() ? 1 : 0.4 }]}>
              <Text style={{ color: t.onAccent, fontWeight: '600' }}>{tr('chat.send')}</Text>
            </Pressable>
          </View>
        </>
      )}

      {opponent && (
        <ReportDialog
          visible={reporting}
          player={opponent}
          onClose={() => setReporting(false)}
          onSubmit={async (reason, note) => {
            const ok = await chat.report(opponent.id, reason, note);
            if (ok) setReported(true);
            return ok;
          }}
        />
      )}
    </Card>
  );
}

export function Chip({ label, onPress, active, disabled }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: t.glassBorder, backgroundColor: active ? t.accent : t.surface, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}>
      <Text style={{ color: active ? t.onAccent : t.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  headerActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  log: { maxHeight: 220, minHeight: 90, borderWidth: 1, borderRadius: 14 },
  bubble: { maxWidth: '85%', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 14 },
  name: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  send: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12 },
});
