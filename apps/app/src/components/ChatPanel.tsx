import { CHAT_MAX_LENGTH, QUICK_MESSAGES, type PlayerInfo } from '@chessmate/core';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
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
 * `fill` makes it fill its parent (the panel over the game screen's dock).
 */
export function ChatPanel({
  chat,
  me,
  opponent,
  canChat,
  fill,
  onClose,
}: {
  chat: GameChat;
  me: PlayerInfo | null;
  opponent: PlayerInfo | null;
  canChat: boolean;
  fill?: boolean;
  onClose?: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const prefs = useChatPrefs();
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [quick, setQuick] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const isMuted = !!opponent && prefs.muted.has(opponent.id);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [chat.lines.length]);

  const submit = () => {
    if (chat.sendText(draft)) setDraft('');
  };

  return (
    <Card style={fill ? styles.fill : { marginTop: 12 }}>
      <View style={styles.header}>
        <Label bold>{tr('chat.title')}</Label>
        <View style={styles.headerActions}>
          {opponent && (
            <>
              <IconChip
                icon={isMuted ? 'volume-off' : 'volume-high'}
                label={isMuted ? tr('chat.unmute') : tr('chat.mute')}
                active={isMuted}
                onPress={() => setMuted(opponent.id, !isMuted)}
              />
              <IconChip icon="flag-outline" label={reported ? tr('chat.reported') : tr('chat.report')} disabled={reported} onPress={() => setReporting(true)} />
            </>
          )}
          <IconChip
            icon={prefs.chatOff ? 'chat-remove-outline' : 'chat-outline'}
            label={prefs.chatOff ? tr('chat.off') : tr('chat.on')}
            active={prefs.chatOff}
            onPress={() => setChatOff(!prefs.chatOff)}
          />
          {onClose && <IconChip icon="close" label={tr('game.close')} onPress={onClose} />}
        </View>
      </View>

      {quick && canChat && !prefs.chatOff ? (
        <ScrollView style={[styles.log, fill && styles.logFill, { borderColor: t.border }]} contentContainerStyle={styles.quickGrid}>
          {QUICK_MESSAGES.map((q) => (
            <Chip
              key={q.id}
              label={quickText(q.id, q.text)}
              onPress={() => {
                chat.sendQuick(q.id);
                setQuick(false);
              }}
            />
          ))}
        </ScrollView>
      ) : (
        <ScrollView ref={scroll} style={[styles.log, fill && styles.logFill, { borderColor: t.border }]} contentContainerStyle={{ padding: 10, gap: 6 }}>
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
      )}

      {chat.notice && <Label muted>{serverText(chat.notice)}</Label>}

      {canChat && !prefs.chatOff && (
        <View style={styles.inputRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('chat.quickA11y')}
            accessibilityState={{ selected: quick }}
            onPress={() => setQuick((q) => !q)}
            style={[styles.roundBtn, { borderColor: t.border, backgroundColor: quick ? t.accent : t.surface }]}>
            <MaterialCommunityIcons name="lightning-bolt-outline" size={20} color={quick ? t.onAccent : t.text} />
          </Pressable>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('chat.send')}
            onPress={submit}
            disabled={!draft.trim()}
            style={[styles.roundBtn, { backgroundColor: t.accent, borderColor: t.accent, opacity: draft.trim() ? 1 : 0.4 }]}>
            <MaterialCommunityIcons name="send" size={18} color={t.onAccent} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />
          </Pressable>
        </View>
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

/** Round icon button with an accessible name, for the chat header. */
function IconChip({ icon, label, onPress, active, disabled }: { icon: ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconChip,
        { borderColor: t.glassBorder, backgroundColor: active ? t.accent : pressed ? t.surfacePressed : t.surface, opacity: disabled ? 0.45 : 1 },
      ]}>
      <MaterialCommunityIcons name={icon} size={17} color={active ? t.onAccent : t.text} />
    </Pressable>
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
  fill: { flex: 1, padding: 12, gap: 8 },
  log: { maxHeight: 220, minHeight: 90, borderWidth: 1, borderRadius: 14 },
  logFill: { flex: 1, maxHeight: undefined, minHeight: 0 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8 },
  iconChip: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  roundBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '85%', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 14 },
  name: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
