import type { CoachChatRequest, CoachChatTurn } from '@chessmate/core';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { askCoach } from '@/lib/coachApi';

const STARTERS = ['Why was my move bad?', 'What is the plan here?', 'What is my opponent threatening?'];

/** Chat with the AI coach about one position. Resets when the position changes. */
export function CoachChat({ context, token }: { context: Omit<CoachChatRequest, 'messages'>; token: string }) {
  const t = useTheme();
  const [messages, setMessages] = useState<CoachChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    seq.current++;
    setMessages([]);
    setError(null);
    setBusy(false);
  }, [context.fen]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: CoachChatTurn[] = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    setError(null);
    const mine = seq.current;
    try {
      const res = await askCoach({ ...context, messages: next }, token);
      if (mine === seq.current) setMessages([...next, { role: 'coach', text: res.reply }]);
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : 'The coach is unavailable');
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };

  return (
    <Card>
      <Label size={18} bold>
        Ask the coach
      </Label>
      {messages.length === 0 && (
        <View style={styles.starters}>
          {STARTERS.map((s) => (
            <Pressable key={s} onPress={() => send(s)} style={[styles.chip, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={{ color: t.text, fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {messages.map((m, i) => (
        <View
          key={i}
          style={[
            styles.bubble,
            m.role === 'user'
              ? { alignSelf: 'flex-end', backgroundColor: t.accent }
              : { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.glassBorder, borderWidth: 1 },
          ]}>
          <Text style={{ color: m.role === 'user' ? t.onAccent : t.text, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
        </View>
      ))}
      {busy && <ActivityIndicator color={t.text} style={{ alignSelf: 'flex-start' }} />}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <View style={styles.row}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => send(draft)}
          placeholder="Ask about this position"
          placeholderTextColor={t.muted}
          maxLength={500}
          returnKeyType="send"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />
        <Button title="Send" onPress={() => send(draft)} disabled={busy || !draft.trim()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  bubble: { maxWidth: '88%', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
