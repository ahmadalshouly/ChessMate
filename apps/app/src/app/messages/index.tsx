import { STAFF_THREAD, type ConversationSummary } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { SignInPrompt } from '@/components/SocialSignIn';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { formatAgo, translate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { messagesApi, onDirectMessage, setUnreadMessages } from '@/lib/messagesApi';
import { useSocialIdentity } from '@/lib/social/session';
import { Avatar, Badge, Button, GlassView, ListGroup, ListRow, Text, useAppTheme } from '@/ui';

/**
 * Messages: conversations with other players and the "ChessMate team" thread
 * (staff messages and announcements). Game chat stays in the game.
 */
export default function Messages() {
  const t = useAppTheme();
  const tr = useT();
  const me = useSocialIdentity();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const r = await messagesApi.conversations();
      setItems(r.conversations);
      setUnreadMessages(r.unread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => onDirectMessage(() => void load()), [load]);

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('messages.title') }} />
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={[styles.inner, { gap: t.space.lg }]}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="title">{tr('messages.title')}</Text>
              <Text tone="muted">{tr('messages.subtitle')}</Text>
            </View>
            {me && (
              <Button
                size="sm"
                variant="secondary"
                title={tr('messages.new')}
                leftIcon={<Ionicons name="create-outline" size={16} color={t.colors.text} />}
                onPress={() => router.push('/friends')}
              />
            )}
          </View>
          {!me ? (
            <SignInPrompt />
          ) : (
            <>
              {error && (
                <GlassView padding="md" radius="lg" style={{ borderColor: t.colors.danger, borderWidth: 1 }}>
                  <Text tone="danger">{serverText(error)}</Text>
                </GlassView>
              )}
              {items.length === 0 && !loading ? (
                <GlassView padding="lg" radius="xl" style={{ gap: t.space.sm }}>
                  <Text variant="heading">{tr('messages.emptyTitle')}</Text>
                  <Text tone="muted">{tr('messages.emptyBody')}</Text>
                </GlassView>
              ) : (
                <ListGroup>
                  {items.map((c) => {
                    const staff = c.key === STAFF_THREAD;
                    const name = staff ? tr('messages.team') : (c.user?.displayName ?? '?');
                    const preview = `${c.last.mine ? `${tr('messages.you')}: ` : ''}${c.last.body.replace(/\s+/g, ' ')}`;
                    return (
                      <ListRow
                        key={c.key}
                        left={
                          staff ? (
                            <View style={[styles.team, { backgroundColor: t.colors.accent }]}>
                              <Ionicons name="shield-checkmark" size={18} color={t.colors.onAccent} />
                            </View>
                          ) : (
                            <Avatar name={name} />
                          )
                        }
                        title={name}
                        subtitle={`${preview.slice(0, 90)} · ${formatAgo(c.last.createdAt)}`}
                        right={c.unread > 0 ? <Badge tone="solid" size="sm" label={c.unread} /> : undefined}
                        chevron
                        onPress={() => router.push({ pathname: '/messages/[key]', params: { key: c.key } })}
                      />
                    );
                  })}
                </ListGroup>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  team: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
