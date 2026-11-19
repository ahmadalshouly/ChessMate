import { formatTimeControl, type FeedItem, type FriendEntry, type FriendRequestEntry, type LiveGameEntry } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DevSignIn } from '@/components/SocialSignIn';
import { Page } from '@/components/shell/Page';
import { feedText } from '@/components/socialFeed';
import { dirIcon, formatAgo, translate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';
import { useAuth } from '@/lib/auth';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';
import { useSocialLive } from '@/lib/social/useSocialLive';
import { useUnreadMessages } from '@/lib/messagesApi';
import { Avatar, Badge, Button, GlassView, ListGroup, ListRow, SectionHeader, Text, useAppTheme } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const FEED_PREVIEW = 6;

/**
 * The community hub: friend requests to answer, friends (online first, with
 * Watch or Challenge), friends' live games, recent activity, and the way to
 * find players, leaderboards and the blocked list.
 */
export default function Social() {
  const t = useAppTheme();
  const tr = useT();
  const me = useSocialIdentity();
  const { status } = useAuth();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [live, setLive] = useState<LiveGameEntry[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequestEntry[]; outgoing: FriendRequestEntry[] }>({ incoming: [], outgoing: [] });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreadMessages = useUnreadMessages();

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const [f, l, r, fd] = await Promise.all([socialApi.friends(), socialApi.live(), socialApi.requests(), socialApi.feed()]);
      setFriends(f);
      setLive(l);
      setRequests(r);
      setFeed(fd.items.slice(0, FEED_PREVIEW));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('friends.loadFailed'));
    } finally {
      setLoaded(true);
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
      void socialApi.live().then(setLive, () => {});
    },
    onEvent: () => void load(),
  });

  const act = (fn: () => Promise<unknown>) => () =>
    void fn()
      .then(load)
      .catch((e: Error) => setError(e.message));

  if (!me) {
    return (
      <Page>
        <Hero />
        <GlassView padding="lg" radius="xl" style={{ gap: t.space.md }}>
          <Text variant="heading">{tr('social.hub.signInTitle')}</Text>
          <Text tone="muted">{tr('social.hub.signInBody')}</Text>
          {status !== 'signedIn' && <Button title={tr('auth.signIn')} onPress={() => router.push({ pathname: '/sign-in', params: { next: '/social' } })} />}
        </GlassView>
        {__DEV__ && <DevSignIn />}
      </Page>
    );
  }

  const order = { playing: 0, online: 1, offline: 2 } as const;
  const sorted = [...friends].sort((a, b) => order[a.presence.status] - order[b.presence.status] || a.user.displayName.localeCompare(b.user.displayName));
  const onlineCount = friends.filter((f) => f.presence.status !== 'offline').length;

  return (
    <Page>
      <Hero onlineCount={onlineCount} friendCount={friends.length} />
      {error && (
        <GlassView padding="md" radius="lg" style={{ borderColor: t.colors.danger, borderWidth: 1 }}>
          <Text tone="danger">{serverText(error)}</Text>
        </GlassView>
      )}

      {requests.incoming.length > 0 && (
        <View style={{ gap: t.space.md }}>
          <SectionHeader title={tr('social.hub.requests')} action={<Badge tone="solid" label={requests.incoming.length} size="sm" />} />
          <ListGroup>
            {requests.incoming.map((r) => (
              <ListRow
                key={r.user.id}
                left={<Avatar name={r.user.displayName} />}
                title={r.user.displayName}
                subtitle={`@${r.user.username} · ${tr('friends.sentAgo', { ago: formatAgo(r.createdAt) })}`}
                onPress={() => router.push(`/friends/user/${r.user.id}`)}
                right={
                  <View style={styles.actions}>
                    <Button size="sm" variant="ghost" title={tr('common.decline')} onPress={act(() => socialApi.decline(r.user.id))} />
                    <Button size="sm" title={tr('common.accept')} onPress={act(() => socialApi.accept(r.user.id))} />
                  </View>
                }
              />
            ))}
          </ListGroup>
        </View>
      )}

      {live.length > 0 && (
        <View style={{ gap: t.space.md }}>
          <SectionHeader title={tr('social.hub.liveNow')} action={<Badge tone="live" label={live.length} size="sm" />} />
          <ListGroup>
            {live.map((g) => (
              <ListRow
                key={g.gameId}
                left={<IconDisc name="eye-outline" />}
                title={tr('friends.liveGame', { white: `${g.white.displayName} (${g.white.rating})`, black: `${g.black.displayName} (${g.black.rating})` })}
                subtitle={`${formatTimeControl(g.timeControl)} · ${g.rated ? tr('play.rated') : tr('play.casual')}`}
                onPress={() => router.push(`/watch/${g.gameId}`)}
                right={<Button size="sm" variant="secondary" title={tr('friends.watch')} onPress={() => router.push(`/watch/${g.gameId}`)} />}
              />
            ))}
          </ListGroup>
        </View>
      )}

      <View style={{ gap: t.space.md }}>
        <SectionHeader
          title={tr('home.friends.title')}
          action={
            <Pressable accessibilityRole="button" onPress={() => router.push('/friends/search')} hitSlop={8}>
              <Text variant="caption" tone="muted">
                {tr('friends.find')}
              </Text>
            </Pressable>
          }
        />
        {sorted.length === 0 ? (
          <GlassView padding="lg" radius="xl" style={{ gap: t.space.md, alignItems: 'flex-start' }}>
            <Text tone="muted">{loaded ? tr('friends.none') : tr('social.hub.loading')}</Text>
            <Button title={tr('friends.find')} leftIcon={<Ionicons name="person-add-outline" size={16} color={t.colors.onAccent} />} onPress={() => router.push('/friends/search')} />
          </GlassView>
        ) : (
          <ListGroup>
            {sorted.map((f) => {
              const playing = f.presence.status === 'playing' && f.presence.gameId;
              return (
                <ListRow
                  key={f.user.id}
                  left={<Avatar name={f.user.displayName} status={f.presence.status} />}
                  title={f.user.displayName}
                  subtitle={presenceText(f)}
                  onPress={() => router.push(`/friends/user/${f.user.id}`)}
                  right={
                    playing ? (
                      <Button size="sm" variant="secondary" title={tr('friends.watch')} onPress={() => router.push(`/watch/${f.presence.gameId}`)} />
                    ) : f.presence.status === 'online' ? (
                      <Button size="sm" title={tr('social.hub.challenge')} onPress={() => router.push({ pathname: '/play/online', params: { mode: 'friend', to: f.user.id } })} />
                    ) : undefined
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </View>

      <View style={{ gap: t.space.md }}>
        <SectionHeader
          title={tr('friends.tabs.activity')}
          action={
            feed.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/friends')} hitSlop={8}>
                <Text variant="caption" tone="muted">
                  {tr('social.hub.seeAll')}
                </Text>
              </Pressable>
            ) : undefined
          }
        />
        {feed.length === 0 ? (
          <GlassView padding="lg" radius="xl">
            <Text tone="muted">{tr('friends.feedEmpty')}</Text>
          </GlassView>
        ) : (
          <ListGroup>
            {feed.map((item) => {
              const { who, text } = feedText(item, me.userId);
              return (
                <ListRow
                  key={item.id}
                  left={<Avatar name={who.displayName} size={32} />}
                  title={text}
                  subtitle={formatAgo(item.at)}
                  onPress={() => router.push(`/friends/user/${who.id}`)}
                />
              );
            })}
          </ListGroup>
        )}
      </View>

      <View style={{ gap: t.space.md }}>
        <SectionHeader title={tr('social.hub.more')} />
        <ListGroup>
          <ListRow
            left={<IconDisc name="chatbubble-ellipses-outline" />}
            title={tr('messages.title')}
            subtitle={unreadMessages > 0 ? tr('messages.unread', { count: unreadMessages }) : tr('messages.subtitle')}
            right={unreadMessages > 0 ? <Badge tone="solid" size="sm" label={unreadMessages} /> : undefined}
            chevron
            onPress={() => router.push('/messages')}
          />
          <ListRow left={<IconDisc name="search-outline" />} title={tr('friends.find')} subtitle={tr('social.hub.findBody')} chevron onPress={() => router.push('/friends/search')} />
          <ListRow left={<IconDisc name="qr-code-outline" />} title={tr('qr.addTitle')} subtitle={tr('qr.addBody')} chevron onPress={() => router.push('/friends/add')} />
          <ListRow
            left={<IconDisc name="mail-outline" />}
            title={tr('social.hub.sentRequests')}
            subtitle={requests.outgoing.length > 0 ? tr('social.hub.waitingCount', { count: requests.outgoing.length }) : tr('friends.noneWaiting')}
            chevron
            onPress={() => router.push('/friends')}
          />
          <ListRow left={<IconDisc name="podium-outline" />} title={tr('home.leaderboards.title')} subtitle={tr('home.leaderboards.body')} chevron onPress={() => router.push('/leaderboard')} />
          <ListRow left={<IconDisc name="ban-outline" />} title={tr('friends.blocked')} chevron onPress={() => router.push('/friends/blocked')} />
        </ListGroup>
      </View>
    </Page>
  );
}

function presenceText(f: FriendEntry): string {
  if (f.presence.status === 'playing') return translate('social.presence.playing');
  if (f.presence.status === 'online') return translate('profile.online');
  return `@${f.user.username}`;
}

function Hero({ onlineCount, friendCount }: { onlineCount?: number; friendCount?: number }) {
  const t = useAppTheme();
  const tr = useT();
  return (
    <View style={[styles.hero, { gap: t.space.md }]}>
      <View style={{ flex: 1, minWidth: 220, gap: t.space.sm }}>
        <Text variant="display">{tr('social.hub.title')}</Text>
        <Text tone="muted">{tr('social.hub.body')}</Text>
      </View>
      {friendCount !== undefined && (
        <View style={styles.heroSide}>
          <Badge tone={onlineCount ? 'live' : 'neutral'} label={tr('social.hub.online', { count: onlineCount ?? 0 })} />
          <Button
            variant="secondary"
            size="sm"
            title={tr('friends.find')}
            onPress={() => router.push('/friends/search')}
            rightIcon={<Ionicons name={dirIcon('arrow-forward')} size={14} color={t.colors.text} />}
          />
        </View>
      )}
    </View>
  );
}

function IconDisc({ name }: { name: IconName }) {
  const c = useAppTheme().colors;
  return (
    <View style={[styles.disc, { borderColor: c.borderStrong, backgroundColor: c.surfaceSunken }]}>
      <Ionicons name={name} size={18} color={c.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  heroSide: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 6 },
  disc: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
