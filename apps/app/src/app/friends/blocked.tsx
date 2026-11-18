import type { SocialUser } from '@chessmate/core';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Pill, UserRow, timeAgo } from '@/components/social';
import { Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi } from '@/lib/social/api';
import { useT } from '@/i18n';

export default function BlockedScreen() {
  const tr = useT();
  const [list, setList] = useState<{ user: SocialUser; since: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => socialApi.blocked().then(setList, (e: Error) => setError(e.message)), []);
  useEffect(() => void load(), [load]);

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('friends.blocked') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <Label muted>{tr('friends.blockedBody')}</Label>
          {error && <Label muted>{error}</Label>}
          <Card>
            {list.length === 0 && <Label muted>{tr('friends.blockedNone')}</Label>}
            {list.map((b) => (
              <UserRow
                key={b.user.id}
                user={b.user}
                subtitle={tr('friends.blockedAgo', { ago: timeAgo(b.since) })}
                right={<Pill title={tr('friends.unblock')} onPress={() => void socialApi.unblock(b.user.id).then(load)} />}
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
