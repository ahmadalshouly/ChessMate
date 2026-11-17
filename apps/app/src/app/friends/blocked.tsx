import type { SocialUser } from '@chessmate/core';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Pill, UserRow, timeAgo } from '@/components/social';
import { Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi } from '@/lib/social/api';

export default function BlockedScreen() {
  const [list, setList] = useState<{ user: SocialUser; since: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => socialApi.blocked().then(setList, (e: Error) => setError(e.message)), []);
  useEffect(() => void load(), [load]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Blocked players' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <Label muted>Blocked players can't find you, send requests, follow you, or watch your games. They aren't told.</Label>
          {error && <Label muted>{error}</Label>}
          <Card>
            {list.length === 0 && <Label muted>You haven't blocked anyone.</Label>}
            {list.map((b) => (
              <UserRow
                key={b.user.id}
                user={b.user}
                subtitle={`Blocked ${timeAgo(b.since)}`}
                right={<Pill title="Unblock" onPress={() => void socialApi.unblock(b.user.id).then(load)} />}
              />
            ))}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
});
