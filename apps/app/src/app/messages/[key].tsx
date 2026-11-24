import { MESSAGE_MAX, STAFF_THREAD, type MessageView } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { formatDateTime, translate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { messagesApi, onDirectMessage, setUnreadMessages, type Thread } from '@/lib/messagesApi';
import { useSocialIdentity } from '@/lib/social/session';
import { Avatar, GlassView, KeyboardAvoider, Text, useAppTheme } from '@/ui';
import { avatarPhotoUri } from '@/lib/avatarPhoto';

/** One conversation: a player, or the ChessMate team (read only). */
export default function Conversation() {
  const t = useAppTheme();
  const c = t.colors;
  const tr = useT();
  const me = useSocialIdentity();
  const { key } = useLocalSearchParams<{ key: string }>();
  const staff = key === STAFF_THREAD;
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    if (!me || !key) return;
    try {
      const th = await messagesApi.thread(key);
      setThread(th);
      setError(null);
      messagesApi.unread().then((r) => setUnreadMessages(r.unread), () => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('messages.loadFailed'));
    }
  }, [me, key]);

  useEffect(() => {
    void load();
  }, [load]);

  // A new message in this conversation (from them, or from you on another device).
  useEffect(
    () =>
      onDirectMessage((m: MessageView) => {
        const inThread = staff ? m.kind !== 'user' : m.from === key || m.to === key;
        if (!inThread) return;
        setThread((th) => (th && !th.messages.some((x) => x.id === m.id) ? { ...th, messages: [...th.messages, m] } : th));
        if (!m.mine) void messagesApi.markRead(key!).then((r) => setUnreadMessages(r.unread), () => {});
      }),
    [key, staff],
  );

  const send = async () => {
    const body = text.trim();
    if (!body || !key || sending) return;
    setSending(true);
    try {
      const { message } = await messagesApi.send(key, body);
      setText('');
      setThread((th) => (th ? { ...th, messages: th.messages.some((x) => x.id === message.id) ? th.messages : [...th.messages, message] } : th));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('messages.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const name = staff ? tr('messages.team') : (thread?.user?.displayName ?? '…');

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: name,
          headerRight: () =>
            !staff && thread?.user ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push(`/friends/user/${thread.user!.id}`)} style={{ paddingHorizontal: 8 }}>
                <Avatar name={name} uri={avatarPhotoUri(thread.user.avatarUrl)} size={30} />
              </Pressable>
            ) : null,
        }}
      />
      {/* Lifts the composer above the keyboard; finds its own offset under the header. */}
      <KeyboardAvoider style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          // The keyboard shrinks the list: keep the latest message in view.
          onLayout={() => scroll.current?.scrollToEnd({ animated: false })}>
          <View style={[styles.inner, { gap: 8 }]}>
            {thread && thread.messages.length === 0 && (
              <Text tone="muted" align="center" style={{ marginTop: 24 }}>
                {tr('messages.startConversation', { name })}
              </Text>
            )}
            {thread?.messages.map((m, i) => {
              const prev = thread.messages[i - 1];
              const showTime = !prev || m.createdAt - prev.createdAt > 15 * 60_000;
              return (
                <View key={m.id} style={{ gap: 4 }}>
                  {showTime && (
                    <Text variant="caption" tone="tertiary" align="center">
                      {formatDateTime(m.createdAt)}
                    </Text>
                  )}
                  <View style={[styles.bubble, m.mine ? [styles.mine, { backgroundColor: c.accent }] : [styles.theirs, { backgroundColor: c.surfaceSunken, borderColor: c.border }]]}>
                    {m.kind === 'broadcast' && (
                      <Text variant="overline" color={m.mine ? c.onAccent : c.muted}>
                        {tr('messages.announcement')}
                      </Text>
                    )}
                    <Text color={m.mine ? c.onAccent : c.text} selectable>
                      {m.body}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
        <View style={[styles.composerWrap, { borderTopColor: c.border }]}>
          <View style={styles.inner}>
            {error && (
              <Text tone="danger" variant="caption" style={{ marginBottom: 6 }}>
                {serverText(error)}
              </Text>
            )}
            {thread && !thread.canSend ? (
              <GlassView padding="md" radius="lg" elevation="none">
                <Text tone="muted" align="center">
                  {staff ? tr('messages.teamReadOnly') : serverText(thread.reason) || tr('messages.cannotSend')}
                </Text>
              </GlassView>
            ) : (
              <View style={[styles.composer, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={tr('messages.placeholder')}
                  placeholderTextColor={c.textTertiary}
                  multiline
                  maxLength={MESSAGE_MAX}
                  style={[styles.input, { color: c.text }]}
                  onSubmitEditing={() => void send()}
                  blurOnSubmit={false}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('messages.send')}
                  disabled={!text.trim() || sending}
                  onPress={() => void send()}
                  style={({ pressed }) => [styles.send, { backgroundColor: c.accent, opacity: !text.trim() || sending ? 0.4 : pressed ? 0.8 : 1 }]}>
                  <Ionicons name="arrow-up" size={18} color={c.onAccent} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, gap: 2 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  composerWrap: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingStart: 14, paddingEnd: 5, paddingVertical: 5 },
  input: { flex: 1, maxHeight: 120, fontSize: 15, paddingVertical: 7 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
