import { PRESET_TIME_CONTROLS, formatTimeControl, timeCategory } from '@chessmate/core';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';

export default function Home() {
  return (
    <Screen>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.inner}>
        <Label size={28} bold>
          Play. Learn. Improve.
        </Label>
        <Label muted>Real-time games against players worldwide, with a coach that shows you why a move works.</Label>

        <Card>
          <Label size={18} bold>
            Play online
          </Label>
          <View style={styles.grid}>
            {PRESET_TIME_CONTROLS.map((tc) => {
              const key = formatTimeControl(tc);
              return (
                <View key={key} style={styles.cell}>
                  <Button
                    variant="secondary"
                    title={`${key} · ${timeCategory(tc)}`}
                    onPress={() => router.push({ pathname: '/play/online', params: { tc: key } })}
                  />
                </View>
              );
            })}
          </View>
        </Card>

        <Card>
          <Label size={18} bold>
            Practice board
          </Label>
          <Label muted>Play both sides with live threat detection and move hints. Works offline.</Label>
          <Button title="Open practice board" onPress={() => router.push('/play/local')} />
        </Card>

        <Card>
          <Label size={18} bold>
            Game history
          </Label>
          <Label muted>Replay past games move by move, see the opening, and share or import PGN.</Label>
          <Button variant="secondary" title="Open game history" onPress={() => router.push('/games')} />
        </Card>
      </View>
    </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '50%', padding: 4 },
});
