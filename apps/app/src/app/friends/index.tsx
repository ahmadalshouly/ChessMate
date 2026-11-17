import { formatTimeControl, type FeedItem, type FriendEntry, type FriendRequestEntry, type LiveGameEntry } from '@chessmate/core';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Pill, Tabs, UserRow, timeAgo } from '@/components/social';
import { DevSignIn } from '@/components/SocialSignIn';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';
import { useSocialLive } from '@/lib/social/useSocialLive';
import { reasonText } from '@/components/play/GameOverCard';
import { translate, translateOr, useT, type TKey } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';

type Tab = 'friends' | 'requests' | 'feed';

export default function FriendsScreen() {
  const me = useSocialIdentity();
  const tr = useT();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [live, setLive] = useState<LiveGameEntry[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] }>({ incoming: [], outgoing: [] });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedNext, setFeedNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const [f, l, r, fd] = await Promise.all([socialApi.friends(), socialApi.live(), socialApi.requests(), socialApi.feed()]);
      setFriends(f);
      setLive(l);
      setRequests(r);
      setFeed(fd.items);
      setFeedNext(fd.next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('friends.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useSocialLive({
    onPresence: (userId, presence) => {
      setFriends((list) => list.map((f) => (f.user.id === userId ? { ...f, presence } : f)));
      // A friend started or finished a game: refresh the live list.
      void socialApi.live().then(setLive, () => {});
    },
    onEvent: () => void load(),
  });

  const act = (fn: () => Promise<unknown>) => () =>
    void fn()
      .then(load)
      .catch((e: Error) => setError(e.message));

  const loadMore = async () => {
    if (!feedNext) return;
    const page = await socialApi.feed(feedNext);
    setFeed((f) => [...f, ...page.items]);
    setFeedNext(page.next);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('home.friends.title') }} />
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.inner}>
          {!me ? (
            <DevSignIn />
          ) : (
            <>
              <Tabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'friends', label: tr('home.friends.title') },
                  { key: 'requests', label: tr('friends.tabs.requests'), badge: requests.incoming.length || undefined },
                  { key: 'feed', label: tr('friends.tabs.activity') },
                ]}
              />
              {error && <Label muted>{serverText(error)}</Label>}

              {tab === 'friends' && (
                <>
                  <Button variant="secondary" title={tr('friends.find')} onPress={() => router.push('/friends/search')} />
                  {live.length > 0 && (
                    <Card>
                      <Label size={18} bold>
                        {tr('home.stats.live')}
                      </Label>
                      {live.map((g) => (
                        <View key={g.gameId} style={styles.liveRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Label bold>
                              {tr('friends.liveGame', { white: `${g.white.displayName} (${g.white.rating})`, black: `${g.black.displayName} (${g.black.rating})` })}
                            </Label>
                            <Label muted size={13}>
                              {formatTimeControl(g.timeControl)} · {g.rated ? tr('play.rated') : tr('play.casual')}
                            </Label>
                          </View>
                          <Pill variant="primary" title={tr('friends.watch')} onPress={() => router.push(`/watch/${g.gameId}`)} />
                        </View>
                      ))}
                    </Card>
                  )}
                  <Card>
                    {friends.length === 0 ? (
                      <Label muted>{tr('friends.none')}</Label>
                    ) : (
                      friends.map((f) => (
                        <UserRow
                          key={f.user.id}
                          user={f.user}
                          presence={f.presence}
                          onPress={() => router.push(`/friends/user/${f.user.id}`)}
                          right={
                            f.presence.status === 'playing' && f.presence.gameId ? (
                              <Pill title={tr('friends.watch')} onPress={() => router.push(`/watch/${f.presence.gameId}`)} />
                            ) : undefined
                          }
                        />
                      ))
                    )}
                  </Card>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Pill title={tr('friends.blocked')} onPress={() => router.push('/friends/blocked')} />
                  </View>
                </>
              )}

              {tab === 'requests' && (
                <>
                  <Card>
                    <Label size={18} bold>
                      {tr('friends.received')}
                    </Label>
                    {requests.incoming.length === 0 && <Label muted>{tr('friends.noPending')}</Label>}
                    {requests.incoming.map((r) => (
                      <UserRow
                        key={r.user.id}
                        user={r.user}
                        subtitle={tr('friends.sentAgo', { ago: timeAgo(r.createdAt) })}
                        onPress={() => router.push(`/friends/user/${r.user.id}`)}
                        right={
                          <>
                            <Pill variant="primary" title={tr('common.accept')} onPress={act(() => socialApi.accept(r.user.id))} />
                            <Pill title={tr('common.decline')} onPress={act(() => socialApi.decline(r.user.id))} />
                          </>
                        }
                      />
                    ))}
                  </Card>
                  <Card>
                    <Label size={18} bold>
                      {tr('friends.sent')}
                    </Label>
                    {requests.outgoing.length === 0 && <Label muted>{tr('friends.noneWaiting')}</Label>}
                    {requests.outgoing.map((r) => (
                      <UserRow
                        key={r.user.id}
                        user={r.user}
                        subtitle={tr('friends.sentAgo', { ago: timeAgo(r.createdAt) })}
                        right={<Pill title={tr('common.cancel')} onPress={act(() => socialApi.cancel(r.user.id))} />}
                      />
                    ))}
                  </Card>
                </>
              )}

              {tab === 'feed' && (
                <Card>
                  {feed.length === 0 && <Label muted>{tr('friends.feedEmpty')}</Label>}
                  {feed.map((item) => (
                    <FeedRow key={item.id} item={item} meId={me.userId} />
                  ))}
                  {feedNext && <Pill title={tr('friends.loadMore')} onPress={() => void loadMore()} />}
                </Card>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

type Person = { id: string; displayName: string };

/**
 * "{a} beat {b}" with the viewer's own name swapped for "You"/"you". Languages conjugate
 * differently for "you", so each verb has `you…` (viewer is the subject) and `…You`
 * (viewer is the object) variants.
 */
function feedSentence(verb: 'beat' | 'drew' | 'friends' | 'followed', a: Person, b: Person, meId: string | null): string {
  const key = (suffix: string) => `friends.feed.${verb}${suffix}` as TKey;
  if (a.id === meId) return translate(key('Subject'), { b: b.displayName });
  if (b.id === meId) return translate(key('Object'), { a: a.displayName });
  return translate(key(''), { a: a.displayName, b: b.displayName });
}

function FeedRow({ item, meId }: { item: FeedItem; meId: string | null }) {
  let text: string;
  let who = item.kind === 'game' ? item.white : item.kind === 'friendship' ? item.a : item.follower;
  switch (item.kind) {
    case 'game': {
      const verdict =
        item.result === '1/2-1/2'
          ? feedSentence('drew', item.white, item.black, meId)
          : item.result === '1-0'
            ? feedSentence('beat', item.white, item.black, meId)
            : feedSentence('beat', item.black, item.white, meId);
      if (item.result === '0-1') who = item.black;
      const category = translateOr(`common.category.${item.category}`, item.category);
      text = `${verdict} ${reasonText(item.reason)} · ${item.rated ? translate('friends.feed.categoryRated', { category }) : category}`;
      break;
    }
    case 'friendship':
      text = feedSentence('friends', item.a, item.b, meId);
      break;
    case 'follow':
      text = feedSentence('followed', item.follower, item.followee, meId);
      break;
  }
  return (
    <View style={styles.feedRow}>
      <UserRow user={who} onPress={() => router.push(`/friends/user/${who.id}`)} />
      <Label muted size={14}>
        {text} · {timeAgo(item.at)}
      </Label>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  feedRow: { paddingVertical: 4, gap: 2 },
});
