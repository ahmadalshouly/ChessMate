import type { UserWithRelationship } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Pill, SearchField, UserRow } from '@/components/social';
import { SignInPrompt } from '@/components/SocialSignIn';
import { Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH, useTheme } from '@/constants/theme';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';
import { useT } from '@/i18n';

export default function SearchScreen() {
  const me = useSocialIdentity();
  const tr = useT();
  const theme = useTheme();
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
      <Stack.Screen options={{ title: tr('friends.find') }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {!me ? (
            <SignInPrompt />
          ) : (
            <>
              <View style={styles.searchRow}>
                <View style={styles.searchGrow}>
                  <SearchField placeholder={tr('friends.searchPlaceholder')} value={q} onChangeText={setQ} autoFocus returnKeyType="search" />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('qr.scanButton')}
                  onPress={() => router.push('/friends/scan')}
                  style={({ pressed }) => [styles.scan, { backgroundColor: theme.surface, borderColor: theme.glassBorder, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="qr-code-outline" size={22} color={theme.text} />
                </Pressable>
              </View>
              {error && <Label muted>{error}</Label>}
              {results.length > 0 && (
                <Card>
                  {results.map((u) => {
                    const r = u.relationship;
                    return (
                      <UserRow
                        key={u.id}
                        user={u}
                        subtitle={r.friend ? tr('friends.friend') : r.followsYou ? tr('friends.followsYou') : undefined}
                        onPress={() => router.push(`/friends/user/${u.id}`)}
                        right={
                          r.blocked ? (
                            <Pill title={tr('friends.unblock')} onPress={act(() => socialApi.unblock(u.id))} />
                          ) : r.friend ? null : r.request === 'incoming' ? (
                            <Pill variant="primary" title={tr('common.accept')} onPress={act(() => socialApi.accept(u.id))} />
                          ) : r.request === 'outgoing' ? (
                            <Pill title={tr('friends.requested')} onPress={act(() => socialApi.cancel(u.id))} />
                          ) : (
                            <Pill variant="primary" title={tr('friends.addFriend')} onPress={act(() => socialApi.sendRequest(u.id))} />
                          )
                        }
                      />
                    );
                  })}
                </Card>
              )}
              {q.trim() && results.length === 0 && !error && <Label muted>{tr('friends.noResults')}</Label>}
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
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  searchGrow: { flex: 1 },
  scan: { width: 50, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
