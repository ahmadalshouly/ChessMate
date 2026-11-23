import { formatTimeControl, type LiveGameEntry } from '@chessmate/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Pill } from '@/components/social';
import { DevSignIn } from '@/components/SocialSignIn';
import { Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { socialApi } from '@/lib/social/api';
import { useSocialIdentity } from '@/lib/social/session';
import { useSocialLive } from '@/lib/social/useSocialLive';
import { translate, useT } from '@/i18n';
import { serverText } from '@/i18n/serverMessages';

/** Watch tab: live games of friends and followed players, each opening the spectator view. */
export default function WatchHome() {
  const me = useSocialIdentity();
  const tr = useT();
  const [live, setLive] = useState<LiveGameEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      setLive(await socialApi.live());
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

  // A friend started or finished a game: refresh the list.
  useSocialLive({ onPresence: () => void load() });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.inner}>
          <Label size={28} bold>
            {tr('nav.watch')}
          </Label>
          {!me ? (
            <DevSignIn />
          ) : (
            <>
              {error && <Label muted>{serverText(error)}</Label>}
              <Card>
                <Label size={18} bold>
                  {tr('home.stats.live')}
                </Label>
                {live.length === 0 ? (
                  <Label muted>{tr('watch.none')}</Label>
                ) : (
                  live.map((g) => (
                    <View key={g.gameId} style={styles.row}>
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
                  ))
                )}
              </Card>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
});
