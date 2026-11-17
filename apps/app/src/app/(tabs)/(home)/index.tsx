import { PRESET_TIME_CONTROLS, formatTimeControl, timeCategory } from '@chessmate/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LiveStats } from '@/components/LiveStats';
import { Page } from '@/components/shell/Page';
import { Button, Card, Label } from '@/components/ui';
import { useT } from '@/i18n';

export default function Home() {
  const tr = useT();
  return (
    <Page>
      <View style={styles.hero}>
        <Label size={28} bold>
          {tr('home.heroTitle')}
        </Label>
        <Label muted>{tr('home.heroBody')}</Label>
      </View>

      <LiveStats />

      <Card>
        <Label size={18} bold>
          {tr('home.online.title')}
        </Label>
        <Button title={tr('home.online.cta')} onPress={() => router.push('/play')} />
        <Label muted>{tr('home.online.quick')}</Label>
        <View style={styles.grid}>
          {PRESET_TIME_CONTROLS.map((tc) => {
            const key = formatTimeControl(tc);
            return (
              <View key={key} style={styles.cell}>
                <Button
                  variant="secondary"
                  title={`${key} · ${tr(`common.category.${timeCategory(tc)}`)}`}
                  onPress={() => router.push({ pathname: '/play/online', params: { tc: key } })}
                />
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.friend.title')}
        </Label>
        <Label muted>{tr('home.friend.body')}</Label>
        <View style={styles.grid}>
          <View style={styles.cell}>
            <Button title={tr('home.friend.cta')} onPress={() => router.push({ pathname: '/play/online', params: { mode: 'friend' } })} />
          </View>
          <View style={styles.cell}>
            <Button variant="secondary" title={tr('home.friend.otb')} onPress={() => router.push('/play/otb')} />
          </View>
        </View>
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.computer.title')}
        </Label>
        <Label muted>{tr('home.computer.body')}</Label>
        <Button title={tr('home.computer.cta')} onPress={() => router.push('/play/computer')} />
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.coach.title')}
        </Label>
        <Label muted>{tr('home.coach.body')}</Label>
        <Button variant="secondary" title={tr('home.coach.cta')} onPress={() => router.push('/review/demo')} />
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.analysis.title')}
        </Label>
        <Label muted>{tr('home.analysis.body')}</Label>
        <Button title={tr('home.analysis.cta')} onPress={() => router.push('/analysis')} />
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.history.title')}
        </Label>
        <Label muted>{tr('home.history.body')}</Label>
        <Button variant="secondary" title={tr('home.history.cta')} onPress={() => router.push('/games')} />
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.friends.title')}
        </Label>
        <Label muted>{tr('home.friends.body')}</Label>
        <Button variant="secondary" title={tr('home.friends.cta')} onPress={() => router.push('/friends')} />
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.practice.title')}
        </Label>
        <Label muted>{tr('home.practice.body')}</Label>
        <Button title={tr('home.practice.cta')} onPress={() => router.push('/play/local')} />
      </Card>

      <Card>
        <Label size={18} bold>
          {tr('home.leaderboards.title')}
        </Label>
        <Label muted>{tr('home.leaderboards.body')}</Label>
        <Button variant="secondary" title={tr('home.leaderboards.cta')} onPress={() => router.push('/leaderboard')} />
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '50%', padding: 4 },
});
