import type { NewsPostView } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AuthorLine, useStaff } from '@/components/community';
import { NewsEditor } from '@/components/NewsEditor';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { newsApi } from '@/lib/communityApi';
import { Button, GlassView, Text, useAppTheme } from '@/ui';

/** News from the ChessMate team, newest first (pinned posts on top). Staff can write posts here. */
export default function NewsScreen() {
  const tr = useT();
  const c = useAppTheme().colors;
  const staff = useStaff();
  const [posts, setPosts] = useState<NewsPostView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await newsApi.list();
      setPosts(r.posts);
      setMore(r.posts.length >= 20);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const loadMore = async () => {
    const last = posts?.at(-1);
    if (!last) return;
    const r = await newsApi.list(last.createdAt).catch(() => null);
    if (!r) return;
    setPosts((p) => [...(p ?? []), ...r.posts.filter((x) => !p?.some((y) => y.id === x.id))]);
    setMore(r.posts.length >= 20);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('news.title') }} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }>
        <View style={styles.inner}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="title">{tr('news.title')}</Text>
              <Text tone="muted">{tr('news.subtitle')}</Text>
            </View>
            {staff && <Button size="sm" title={tr('news.write')} onPress={() => setWriting(true)} leftIcon={<Ionicons name="create-outline" size={15} color={c.onAccent} />} />}
          </View>
          {error && <Text tone="muted">{serverText(error)}</Text>}
          {posts?.length === 0 && (
            <GlassView radius="xl" padding="lg">
              <Text tone="muted">{tr('news.empty')}</Text>
            </GlassView>
          )}
          {posts?.map((p) => (
            <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push(`/news/${p.id}`)}>
              {({ pressed }) => (
                <GlassView radius="xl" padding="lg" style={{ gap: 10, opacity: pressed ? 0.85 : 1 }}>
                  {p.pinned && (
                    <View style={styles.pinned}>
                      <Ionicons name="pin" size={13} color={c.muted} />
                      <Text variant="overline" tone="muted">
                        {tr('community.pinned')}
                      </Text>
                    </View>
                  )}
                  <Text variant="heading">{p.title}</Text>
                  <AuthorLine author={p.author} at={p.createdAt} />
                  <Text tone="muted" numberOfLines={4}>
                    {p.body}
                  </Text>
                  <View style={styles.stats}>
                    <Ionicons name={p.liked ? 'heart' : 'heart-outline'} size={16} color={p.liked ? c.danger : c.muted} />
                    <Text variant="caption" tone="muted">
                      {p.likeCount}
                    </Text>
                    <Ionicons name="chatbubble-outline" size={15} color={c.muted} style={{ marginStart: 12 }} />
                    <Text variant="caption" tone="muted">
                      {p.commentCount}
                    </Text>
                  </View>
                </GlassView>
              )}
            </Pressable>
          ))}
          {more && <Button variant="secondary" title={tr('community.loadMore')} onPress={loadMore} />}
        </View>
      </ScrollView>
      <NewsEditor visible={writing} onClose={() => setWriting(false)} onSaved={(p) => setPosts((list) => [p, ...(list ?? [])])} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
