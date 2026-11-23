import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { HeadToHeadCard } from '@/components/HeadToHead';
import { Avatar, Pill, presenceLabel } from '@/components/social';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi, type Profile } from '@/lib/social/api';
import { useSocialRefresh } from '@/lib/realtime';
import { useSocialIdentity } from '@/lib/social/session';
import { useT } from '@/i18n';
import { countryLabel } from '@/i18n/chess';
import { serverText } from '@/i18n/serverMessages';

/** Player card with every social action: friend, follow, watch, block. */
export default function PlayerCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSocialIdentity();
  const tr = useT();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const load = useCallback(
    () =>
      socialApi.user(String(id)).then(
        (x) => {
          setP(x);
          setError(null);
        },
        (e: Error) => setError(e.message),
      ),
    [id],
  );
  // Fresh on every visit, and live when they accept, remove or message you.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useSocialRefresh(() => void load());

  const act = (fn: () => Promise<unknown>) => () =>
    void fn()
      .then(load)
      .catch((e: Error) => setError(e.message));

  const self = !!me?.userId && me.userId === p?.id;
  const r = p?.relationship;

  return (
    <Screen>
      <Stack.Screen options={{ title: p ? p.displayName : tr('friends.card.player') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          {error && <Label muted>{serverText(error)}</Label>}
          {p && r && (
            <>
              <Card>
                <View style={styles.head}>
                  <Avatar user={p} size={64} presence={p.presence} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Label size={22} bold>
                      {p.displayName}
                    </Label>
                    <Label muted>
                      @{p.username}
                      {p.country ? ` · ${countryLabel(p.country) ?? p.country}` : ''}
                    </Label>
                    {p.presence && <Label muted>{presenceLabel(p.presence)}</Label>}
                  </View>
                </View>
                <Label muted>
                  {tr('friends.card.friends', { count: p.friends })} · {tr('friends.card.followers', { count: p.followers })}
                  {r.followsYou ? ` · ${tr('friends.followsYou')}` : ''}
                </Label>
              </Card>

              {!self && <HeadToHeadCard userId={p.id} name={p.displayName || p.username} presence={p.presence ?? null} />}

              {!self && (
                <Card>
                  {p.presence?.status === 'playing' && p.presence.gameId && (
                    <Button title={tr('friends.card.watchLive')} onPress={() => router.push(`/watch/${p.presence!.gameId}`)} />
                  )}
                  {r.blocked ? (
                    <Button variant="secondary" title={tr('friends.unblock')} onPress={act(() => socialApi.unblock(p.id))} />
                  ) : (
                    <>
                      {r.friend ? (
                        <Button variant="secondary" title={tr('friends.card.remove')} onPress={act(() => socialApi.unfriend(p.id))} />
                      ) : r.request === 'incoming' ? (
                        <View style={styles.row}>
                          <View style={{ flex: 1 }}>
                            <Button title={tr('friends.card.acceptRequest')} onPress={act(() => socialApi.accept(p.id))} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button variant="secondary" title={tr('common.decline')} onPress={act(() => socialApi.decline(p.id))} />
                          </View>
                        </View>
                      ) : r.request === 'outgoing' ? (
                        <Button variant="secondary" title={tr('friends.card.cancelRequest')} onPress={act(() => socialApi.cancel(p.id))} />
                      ) : (
                        <Button title={tr('friends.addFriend')} onPress={act(() => socialApi.sendRequest(p.id))} />
                      )}
                      <Button
                        variant="secondary"
                        title={tr('profile.actions.message')}
                        onPress={() => router.push({ pathname: '/messages/[key]', params: { key: p.id } })}
                      />
                      <Button variant="secondary" title={tr('profile.actions.viewProfile')} onPress={() => router.push(`/profile/${encodeURIComponent(p.username)}`)} />
                      <Button
                        variant="secondary"
                        title={r.following ? tr('friends.card.unfollow') : tr('friends.card.follow')}
                        onPress={act(() => (r.following ? socialApi.unfollow(p.id) : socialApi.follow(p.id)))}
                      />
                      {confirmBlock ? (
                        <View style={{ gap: 8 }}>
                          <Label muted>
                            {tr('friends.card.blockWarning')}
                          </Label>
                          <View style={styles.row}>
                            <Pill variant="danger" title={tr('friends.card.block')} onPress={act(() => socialApi.block(p.id).then(() => setConfirmBlock(false)))} />
                            <Pill title={tr('common.cancel')} onPress={() => setConfirmBlock(false)} />
                          </View>
                        </View>
                      ) : (
                        <Pill variant="danger" title={tr('friends.card.blockPlayer')} onPress={() => setConfirmBlock(true)} />
                      )}
                    </>
                  )}
                </Card>
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
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
