import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GameReplay } from '@/components/GameReplay';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { useArchivedGame } from '@/lib/archive';

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, loading } = useArchivedGame(id);
  const tr = useT();
  if (!game) {
    return (
      <Screen>
        <Stack.Screen options={{ title: tr('games.replay.title') }} />
        <View style={styles.page}>
          {!loading && (
            <Card>
              <Label bold>{tr('games.replay.notFound')}</Label>
              <Label muted>{tr('games.replay.notFoundBody')}</Label>
              <Button title={tr('games.replay.backToHistory')} onPress={() => router.replace('/games')} />
            </Card>
          )}
        </View>
      </Screen>
    );
  }
  return <GameReplay game={game} />;
}


const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
});
