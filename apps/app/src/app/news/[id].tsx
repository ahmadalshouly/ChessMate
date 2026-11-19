import { COMMUNITY_LIMITS, type CommentView, type NewsPostView } from '@chessmate/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Action, AuthorLine, CommentItem, Composer, useSignedIn, useStaff } from '@/components/community';
import { NewsEditor } from '@/components/NewsEditor';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { newsApi } from '@/lib/communityApi';
import { GlassView, Text } from '@/ui';

/** One news post: the full text, likes, comments, and the team's edit tools. */
export default function NewsPostScreen() {
  const tr = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useStaff();
  const signedIn = useSignedIn();
  const [post, setPost] = useState<NewsPostView | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    newsApi.get(id).then(
      (r) => {
        setPost(r.post);
        setComments(r.comments);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  useEffect(load, [load]);

  const toggleLike = async () => {
    if (!post) return;
    if (!signedIn) return router.push('/sign-in');
    const next = !post.liked;
    setPost({ ...post, liked: next, likeCount: post.likeCount + (next ? 1 : -1) });
    const r = await newsApi.like(post.id, next).catch(() => null);
    if (r) setPost((p) => p && { ...p, liked: r.liked, likeCount: r.likeCount });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: post?.title ?? tr('news.title') }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {error && <Text tone="muted">{serverText(error)}</Text>}
          {post && (
            <>
              <GlassView radius="xl" padding="lg" style={{ gap: 12 }}>
                <Text variant="title">{post.title}</Text>
                <AuthorLine author={post.author} at={post.createdAt} />
                <Text selectable style={{ lineHeight: 24 }}>
                  {post.body}
                </Text>
                <View style={styles.actions}>
                  <Action icon={post.liked ? 'heart' : 'heart-outline'} label={tr('news.likes', { count: post.likeCount })} active={post.liked} onPress={toggleLike} />
                  {staff && (
                    <>
                      <Action icon="create-outline" label={tr('news.edit')} onPress={() => setEditing(true)} />
                      <Action
                        icon="trash-outline"
                        label={confirmDelete ? tr('community.confirmDelete') : tr('community.delete')}
                        danger
                        onPress={async () => {
                          if (!confirmDelete) return setConfirmDelete(true);
                          await newsApi.remove(post.id).catch((e: Error) => setError(e.message));
                          router.back();
                        }}
                      />
                    </>
                  )}
                </View>
              </GlassView>

              <GlassView radius="xl" padding="lg" style={{ gap: 4 }}>
                <Text variant="heading">{tr('news.comments', { count: comments.length })}</Text>
                {comments.map((cm) => (
                  <CommentItem
                    key={cm.id}
                    author={cm.author}
                    body={cm.body}
                    at={cm.createdAt}
                    canDelete={cm.canDelete}
                    onDelete={async () => {
                      await newsApi.deleteComment(cm.id).catch((e: Error) => setError(e.message));
                      setComments((list) => list.filter((x) => x.id !== cm.id));
                    }}
                  />
                ))}
                <View style={{ marginTop: 10 }}>
                  <Composer
                    placeholder={tr('news.commentPlaceholder')}
                    maxLength={COMMUNITY_LIMITS.commentMax}
                    onSend={async (text) => {
                      const r = await newsApi.comment(post.id, text);
                      setComments((list) => [...list, r.comment]);
                    }}
                  />
                </View>
              </GlassView>
            </>
          )}
        </View>
      </ScrollView>
      <NewsEditor visible={editing} onClose={() => setEditing(false)} post={post} onSaved={setPost} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
