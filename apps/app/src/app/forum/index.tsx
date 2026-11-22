import { COMMUNITY_LIMITS, FORUM_CATEGORIES, type ForumCategory, type TopicView } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AuthorLine, useSignedIn } from '@/components/community';
import { Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { formatAgo, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { forumApi } from '@/lib/communityApi';
import { Button, GlassView, Modal, Text, TextField, useAppTheme } from '@/ui';

/** Forum: topics by category, most recent activity first (pinned on top). */
export default function ForumScreen() {
  const tr = useT();
  const c = useAppTheme().colors;
  const signedIn = useSignedIn();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<ForumCategory | null>(
    (FORUM_CATEGORIES as readonly string[]).includes(params.category ?? '') ? (params.category as ForumCategory) : null,
  );
  const [topics, setTopics] = useState<TopicView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await forumApi.list(category ?? undefined);
      setTopics(r.topics);
      setMore(r.topics.length >= 30);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [category]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const loadMore = async () => {
    const last = topics?.at(-1);
    if (!last) return;
    const r = await forumApi.list(category ?? undefined, last.lastActivityAt).catch(() => null);
    if (!r) return;
    setTopics((t) => [...(t ?? []), ...r.topics.filter((x) => !t?.some((y) => y.id === x.id))]);
    setMore(r.topics.length >= 30);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('forum.title') }} />
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
              <Text variant="title">{tr('forum.title')}</Text>
              <Text tone="muted">{tr('forum.subtitle')}</Text>
            </View>
            <Button
              size="sm"
              title={tr('forum.newTopic')}
              onPress={() => (signedIn ? setComposing(true) : router.push('/sign-in'))}
              leftIcon={<Ionicons name="add" size={16} color={c.onAccent} />}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[null, ...FORUM_CATEGORIES].map((cat) => {
              const on = cat === category;
              return (
                <Pressable
                  key={cat ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCategory(cat)}
                  style={[styles.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface }]}>
                  <Text variant="label" color={on ? c.onAccent : c.text}>
                    {cat ? tr(`forum.category.${cat}`) : tr('forum.all')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {error && <Text tone="muted">{serverText(error)}</Text>}
          {topics?.length === 0 && (
            <GlassView radius="xl" padding="lg">
              <Text tone="muted">{tr('forum.empty')}</Text>
            </GlassView>
          )}
          <View style={{ gap: 10 }}>
            {topics?.map((t) => (
              <Pressable key={t.id} accessibilityRole="link" onPress={() => router.push(`/forum/${t.id}`)}>
                {({ pressed }) => (
                  <GlassView radius="lg" padding="md" style={{ gap: 6, opacity: pressed ? 0.85 : 1 }}>
                    <View style={styles.titleRow}>
                      {t.pinned && <Ionicons name="pin" size={14} color={c.muted} />}
                      {t.locked && <Ionicons name="lock-closed" size={13} color={c.muted} />}
                      <Text variant="subheading" style={{ flex: 1 }} numberOfLines={2}>
                        {t.title}
                      </Text>
                    </View>
                    <AuthorLine author={t.author} at={t.createdAt} />
                    <View style={styles.meta}>
                      <Text variant="caption" tone="tertiary">
                        {tr(`forum.category.${t.category}`)}
                      </Text>
                      <Ionicons name="chatbubble-outline" size={13} color={c.textTertiary} style={{ marginStart: 10 }} />
                      <Text variant="caption" tone="tertiary">
                        {t.replyCount}
                      </Text>
                      <Text variant="caption" tone="tertiary" style={{ marginStart: 'auto' }}>
                        {tr('forum.active', { ago: formatAgo(t.lastActivityAt) })}
                      </Text>
                    </View>
                  </GlassView>
                )}
              </Pressable>
            ))}
          </View>
          {more && <Button variant="secondary" title={tr('community.loadMore')} onPress={loadMore} />}
        </View>
      </ScrollView>
      <NewTopic visible={composing} onClose={() => setComposing(false)} initialCategory={category ?? 'general'} />
    </Screen>
  );
}

function NewTopic({ visible, onClose, initialCategory }: { visible: boolean; onClose: () => void; initialCategory: ForumCategory }) {
  const tr = useT();
  const c = useAppTheme().colors;
  const [category, setCategory] = useState<ForumCategory>(initialCategory);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async () => {
    setBusy(true);
    try {
      const r = await forumApi.start({ category, title, body });
      setTitle('');
      setBody('');
      onClose();
      router.push(`/forum/${r.topic.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      presentation="sheet"
      title={tr('forum.newTopic')}
      description={tr('forum.rules')}
      actions={
        <>
          <Button variant="ghost" title={tr('common.cancel')} onPress={onClose} />
          <Button title={tr('forum.post')} onPress={post} loading={busy} disabled={!title.trim() || !body.trim()} />
        </>
      }>
      <View style={{ gap: 14 }}>
        <View style={styles.chipsWrap}>
          {FORUM_CATEGORIES.map((cat) => {
            const on = cat === category;
            return (
              <Pressable
                key={cat}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setCategory(cat)}
                style={[styles.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface }]}>
                <Text variant="label" color={on ? c.onAccent : c.text}>
                  {tr(`forum.category.${cat}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextField label={tr('forum.titleLabel')} value={title} onChangeText={setTitle} maxLength={COMMUNITY_LIMITS.titleMax} />
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={COMMUNITY_LIMITS.topicBodyMax}
          placeholder={tr('forum.bodyPlaceholder')}
          placeholderTextColor={c.textTertiary}
          style={[styles.body, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceSunken }]}
          accessibilityLabel={tr('forum.bodyPlaceholder')}
        />
        {error && (
          <Text variant="caption" tone="danger">
            {serverText(error)}
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { gap: 8, paddingVertical: 2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { minHeight: 160, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, fontSize: 15, textAlignVertical: 'top' },
});
