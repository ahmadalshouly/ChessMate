import { SAMPLE_GAME_ANALYSIS } from '@chessmate/core';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GameReview } from '@/components/coach/GameReview';
import { Label, Screen } from '@/components/ui';
import { MAX_CONTENT_WIDTH } from '@/constants/theme';
import { useT } from '@/i18n';

/**
 * Coach review of a sample game. Real games will open GameReview with the
 * engine's analysis once engine analysis lands.
 */
export default function ReviewDemo() {
  const tr = useT();
  const [token] = useState(() => `guest:Guest${Math.floor(Math.random() * 9000 + 1000)}`);
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('coach.title') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.inner}>
          <Label muted size={13}>
            {tr('coach.sample', { opening: SAMPLE_GAME_ANALYSIS.opening?.name ?? '' })}
          </Label>
          <GameReview analysis={SAMPLE_GAME_ANALYSIS} perspective="w" token={token} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: 16 },
});
