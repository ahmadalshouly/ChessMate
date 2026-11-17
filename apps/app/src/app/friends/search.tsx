import type { UserWithRelationship } from '@chessmate/core';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Pill, SearchField, UserRow } from '@/components/social';
import { DevSignIn } from '@/components/SocialSignIn';
import { Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';

export default function SearchScreen() {
  const me = useSocialIdentity();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserWithRelationship[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = (query: string) =>
    socialApi.search(query).then(
      (r) => {
        setResults(r);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );

  useEffect(() => {
    if (!me || !q.trim()) return setResults([]);
    const t = setTimeout(() => void run(q), 250);
    return () => clearTimeout(t);
  }, [q, me]);

  const act = (fn: () => Promise<unknown>) => () =>
    void fn()
      .then(() => run(q))
      .catch((e: Error) => setError(e.message));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Find players' }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {!me ? (
            <DevSignIn />
          ) : (
            <>
              <SearchField placeholder="Search by username" value={q} onChangeText={setQ} autoFocus returnKeyType="search" />
              {error && <Label muted>{error}</Label>}
              {results.length > 0 && (
                <Card>
                  {results.map((u) => {
                    const r = u.relationship;
                    return (
                      <UserRow
                        key={u.id}
                        user={u}
                        subtitle={r.friend ? 'Friend' : r.followsYou ? 'Follows you' : undefined}
                        onPress={() => router.push(`/friends/user/${u.id}`)}
                        right={
                          r.blocked ? (
                            <Pill title="Unblock" onPress={act(() => socialApi.unblock(u.id))} />
                          ) : r.friend ? null : r.request === 'incoming' ? (
                            <Pill variant="primary" title="Accept" onPress={act(() => socialApi.accept(u.id))} />
                          ) : r.request === 'outgoing' ? (
                            <Pill title="Requested" onPress={act(() => socialApi.cancel(u.id))} />
                          ) : (
                            <Pill variant="primary" title="Add friend" onPress={act(() => socialApi.sendRequest(u.id))} />
                          )
                        }
                      />
                    );
                  })}
                </Card>
              )}
              {q.trim() && results.length === 0 && !error && <Label muted>No players found.</Label>}
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
});
