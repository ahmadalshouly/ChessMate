import { PRESET_TIME_CONTROLS, formatTimeControl, timeCategory } from '@chessmate/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LiveStats } from '@/components/LiveStats';
import { Page } from '@/components/shell/Page';
import { Button, Card, Label } from '@/components/ui';

export default function Home() {
  return (
    <Page>
      <View style={styles.hero}>
        <Label size={28} bold>
          Play. Learn. Improve.
        </Label>
        <Label muted>Real-time games against players worldwide, with a coach that shows you why a move works.</Label>
      </View>

      <LiveStats />

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
          Play a friend
        </Label>
        <Label muted>Send an invite link or challenge a player, or play face to face on one device.</Label>
        <View style={styles.grid}>
          <View style={styles.cell}>
            <Button title="Challenge a friend" onPress={() => router.push({ pathname: '/play/online', params: { mode: 'friend' } })} />
          </View>
          <View style={styles.cell}>
            <Button variant="secondary" title="Over the board" onPress={() => router.push('/play/otb')} />
          </View>
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
          Leaderboards
        </Label>
        <Label muted>Top players in bullet, blitz, rapid and classical, worldwide, in your country, and among your friends.</Label>
        <Button variant="secondary" title="View leaderboards" onPress={() => router.push('/leaderboard')} />
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '50%', padding: 4 },
});
