import { COMMUNITY_LIMITS, type ReplyView, type TopicView } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Action, AuthorLine, CommentItem, Composer, useStaff } from '@/components/community';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { forumApi } from '@/lib/communityApi';
import { useSocialRefresh } from '@/lib/realtime';
import { Badge, GlassView, Text } from '@/ui';

/** One forum topic with its replies; staff can pin, lock or remove it. */
export default function TopicScreen() {
  const tr = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useStaff();
  const [topic, setTopic] = useState<TopicView | null>(null);
  const [replies, setReplies] = useState<ReplyView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    forumApi.get(id).then(
      (r) => {
        setTopic(r.topic);
        setReplies(r.replies);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  useEffect(load, [load]);
  useSocialRefresh(load, ['message']);

  const moderate = async (patch: { pinned?: boolean; locked?: boolean }) => {
    if (!topic) return;
    const r = await forumApi.moderate(topic.id, patch).catch((e: Error) => (setError(e.message), null));
    if (r) setTopic(r.topic);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: topic?.title ?? tr('forum.title') }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {error && <Text tone="muted">{serverText(error)}</Text>}
          {topic && (
            <>
              <GlassView radius="xl" padding="lg" style={{ gap: 12 }}>
                <View style={styles.badges}>
                  <Badge tone="outline" label={tr(`forum.category.${topic.category}`)} />
                  {topic.pinned && <Badge tone="neutral" label={tr('community.pinned')} />}
                  {topic.locked && <Badge tone="neutral" label={tr('forum.locked')} />}
                </View>
                <Text variant="title">{topic.title}</Text>
                <AuthorLine author={topic.author} at={topic.createdAt} />
                <Text selectable style={{ lineHeight: 24 }}>
                  {topic.body}
                </Text>
                {(staff || topic.canDelete) && (
                  <View style={styles.actions}>
                    {staff && (
                      <>
                        <Action icon="pin-outline" label={topic.pinned ? tr('forum.unpin') : tr('forum.pinIt')} active={topic.pinned} onPress={() => moderate({ pinned: !topic.pinned })} />
                        <Action icon="lock-closed-outline" label={topic.locked ? tr('forum.unlock') : tr('forum.lock')} active={topic.locked} onPress={() => moderate({ locked: !topic.locked })} />
                      </>
                    )}
                    {topic.canDelete && (
                      <Action
                        icon="trash-outline"
                        danger
                        label={confirmDelete ? tr('community.confirmDelete') : tr('community.delete')}
                        onPress={async () => {
                          if (!confirmDelete) return setConfirmDelete(true);
                          await forumApi.removeTopic(topic.id).catch((e: Error) => setError(e.message));
                          router.back();
                        }}
                      />
                    )}
                  </View>
                )}
              </GlassView>

              <GlassView radius="xl" padding="lg" style={{ gap: 4 }}>
                <Text variant="heading">{tr('forum.replies', { count: replies.length })}</Text>
                {replies.map((r) => (
                  <CommentItem
                    key={r.id}
                    author={r.author}
                    body={r.body}
                    at={r.createdAt}
                    canDelete={r.canDelete}
                    onDelete={async () => {
                      await forumApi.removeReply(r.id).catch((e: Error) => setError(e.message));
                      setReplies((list) => list.filter((x) => x.id !== r.id));
                    }}
                  />
                ))}
                <View style={{ marginTop: 10 }}>
                  <Composer
                    placeholder={tr('forum.replyPlaceholder')}
                    maxLength={COMMUNITY_LIMITS.commentMax * 3}
                    disabledReason={topic.locked && !staff ? tr('forum.lockedNote') : null}
                    onSend={async (text) => {
                      const r = await forumApi.reply(topic.id, text);
                      setReplies((list) => [...list, r.reply]);
                    }}
                  />
                </View>
              </GlassView>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
