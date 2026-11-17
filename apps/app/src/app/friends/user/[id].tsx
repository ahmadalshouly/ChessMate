import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Pill, presenceLabel } from '@/components/social';
import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi, type Profile } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';

/** Player card with every social action: friend, follow, watch, block. */
export default function PlayerCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSocialIdentity();
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
  useEffect(() => void load(), [load]);

  const act = (fn: () => Promise<unknown>) => () =>
    void fn()
      .then(load)
      .catch((e: Error) => setError(e.message));

  const self = !!me?.userId && me.userId === p?.id;
  const r = p?.relationship;

  return (
    <Screen>
      <Stack.Screen options={{ title: p ? p.displayName : 'Player' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          {error && <Label muted>{error}</Label>}
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
                      {p.country ? ` · ${p.country}` : ''}
                    </Label>
                    {p.presence && <Label muted>{presenceLabel(p.presence)}</Label>}
                  </View>
                </View>
                <Label muted>
                  {p.friends} {p.friends === 1 ? 'friend' : 'friends'} · {p.followers} {p.followers === 1 ? 'follower' : 'followers'}
                  {r.followsYou ? ' · Follows you' : ''}
                </Label>
              </Card>

              {!self && (
                <Card>
                  {p.presence?.status === 'playing' && p.presence.gameId && (
                    <Button title="Watch live game" onPress={() => router.push(`/watch/${p.presence!.gameId}`)} />
                  )}
                  {r.blocked ? (
                    <Button variant="secondary" title="Unblock" onPress={act(() => socialApi.unblock(p.id))} />
                  ) : (
                    <>
                      {r.friend ? (
                        <Button variant="secondary" title="Remove friend" onPress={act(() => socialApi.unfriend(p.id))} />
                      ) : r.request === 'incoming' ? (
                        <View style={styles.row}>
                          <View style={{ flex: 1 }}>
                            <Button title="Accept request" onPress={act(() => socialApi.accept(p.id))} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button variant="secondary" title="Decline" onPress={act(() => socialApi.decline(p.id))} />
                          </View>
                        </View>
                      ) : r.request === 'outgoing' ? (
                        <Button variant="secondary" title="Cancel friend request" onPress={act(() => socialApi.cancel(p.id))} />
                      ) : (
                        <Button title="Add friend" onPress={act(() => socialApi.sendRequest(p.id))} />
                      )}
                      <Button
                        variant="secondary"
                        title={r.following ? 'Unfollow' : 'Follow'}
                        onPress={act(() => (r.following ? socialApi.unfollow(p.id) : socialApi.follow(p.id)))}
                      />
                      {confirmBlock ? (
                        <View style={{ gap: 8 }}>
                          <Label muted>
                            Blocking removes them from your friends and followers, and stops them finding you or watching your games.
                          </Label>
                          <View style={styles.row}>
                            <Pill variant="danger" title="Block" onPress={act(() => socialApi.block(p.id).then(() => setConfirmBlock(false)))} />
                            <Pill title="Cancel" onPress={() => setConfirmBlock(false)} />
                          </View>
                        </View>
                      ) : (
                        <Pill variant="danger" title="Block player" onPress={() => setConfirmBlock(true)} />
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
