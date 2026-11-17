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

type Tab = 'friends' | 'requests' | 'feed';

export default function FriendsScreen() {
  const me = useSocialIdentity();
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
      setError(e instanceof Error ? e.message : 'Could not load friends');
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
      <Stack.Screen options={{ title: 'Friends' }} />
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
                  { key: 'friends', label: 'Friends' },
                  { key: 'requests', label: 'Requests', badge: requests.incoming.length || undefined },
                  { key: 'feed', label: 'Activity' },
                ]}
              />
              {error && <Label muted>{error}</Label>}

              {tab === 'friends' && (
                <>
                  <Button variant="secondary" title="Find players" onPress={() => router.push('/friends/search')} />
                  {live.length > 0 && (
                    <Card>
                      <Label size={18} bold>
                        Live now
                      </Label>
                      {live.map((g) => (
                        <View key={g.gameId} style={styles.liveRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Label bold>
                              {g.white.displayName} ({g.white.rating}) vs {g.black.displayName} ({g.black.rating})
                            </Label>
                            <Label muted size={13}>
                              {formatTimeControl(g.timeControl)} · {g.rated ? 'Rated' : 'Casual'}
                            </Label>
                          </View>
                          <Pill variant="primary" title="Watch" onPress={() => router.push(`/watch/${g.gameId}`)} />
                        </View>
                      ))}
                    </Card>
                  )}
                  <Card>
                    {friends.length === 0 ? (
                      <Label muted>No friends yet. Find players by username and send a request.</Label>
                    ) : (
                      friends.map((f) => (
                        <UserRow
                          key={f.user.id}
                          user={f.user}
                          presence={f.presence}
                          onPress={() => router.push(`/friends/user/${f.user.id}`)}
                          right={
                            f.presence.status === 'playing' && f.presence.gameId ? (
                              <Pill title="Watch" onPress={() => router.push(`/watch/${f.presence.gameId}`)} />
                            ) : undefined
                          }
                        />
                      ))
                    )}
                  </Card>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Pill title="Blocked players" onPress={() => router.push('/friends/blocked')} />
                  </View>
                </>
              )}

              {tab === 'requests' && (
                <>
                  <Card>
                    <Label size={18} bold>
                      Received
                    </Label>
                    {requests.incoming.length === 0 && <Label muted>No pending requests.</Label>}
                    {requests.incoming.map((r) => (
                      <UserRow
                        key={r.user.id}
                        user={r.user}
                        subtitle={`Sent ${timeAgo(r.createdAt)}`}
                        onPress={() => router.push(`/friends/user/${r.user.id}`)}
                        right={
                          <>
                            <Pill variant="primary" title="Accept" onPress={act(() => socialApi.accept(r.user.id))} />
                            <Pill title="Decline" onPress={act(() => socialApi.decline(r.user.id))} />
                          </>
                        }
                      />
                    ))}
                  </Card>
                  <Card>
                    <Label size={18} bold>
                      Sent
                    </Label>
                    {requests.outgoing.length === 0 && <Label muted>You have no requests waiting.</Label>}
                    {requests.outgoing.map((r) => (
                      <UserRow
                        key={r.user.id}
                        user={r.user}
                        subtitle={`Sent ${timeAgo(r.createdAt)}`}
                        right={<Pill title="Cancel" onPress={act(() => socialApi.cancel(r.user.id))} />}
                      />
                    ))}
                  </Card>
                </>
              )}

              {tab === 'feed' && (
                <Card>
                  {feed.length === 0 && <Label muted>Games and new friendships from your network show up here.</Label>}
                  {feed.map((item) => (
                    <FeedRow key={item.id} item={item} meId={me.userId} />
                  ))}
                  {feedNext && <Pill title="Load more" onPress={() => void loadMore()} />}
                </Card>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const REASON: Record<string, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  abandoned: 'by abandonment',
  stalemate: 'by stalemate',
  draw_agreement: 'by agreement',
  threefold_repetition: 'by repetition',
  fifty_move_rule: 'by the 50-move rule',
  insufficient_material: 'by insufficient material',
};

function FeedRow({ item, meId }: { item: FeedItem; meId: string | null }) {
  const name = (u: { id: string; displayName: string }, first = true) => (u.id === meId ? (first ? 'You' : 'you') : u.displayName);
  let text: string;
  let who = item.kind === 'game' ? item.white : item.kind === 'friendship' ? item.a : item.follower;
  switch (item.kind) {
    case 'game': {
      const verdict =
        item.result === '1/2-1/2'
          ? `${name(item.white)} drew with ${name(item.black, false)}`
          : item.result === '1-0'
            ? `${name(item.white)} beat ${name(item.black, false)}`
            : `${name(item.black)} beat ${name(item.white, false)}`;
      if (item.result === '0-1') who = item.black;
      text = `${verdict} ${REASON[item.reason] ?? ''} · ${item.category}${item.rated ? ', rated' : ''}`;
      break;
    }
    case 'friendship':
      text = `${name(item.a)} and ${name(item.b, false)} are now friends`;
      break;
    case 'follow':
      text = `${name(item.follower)} followed ${name(item.followee, false)}`;
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
