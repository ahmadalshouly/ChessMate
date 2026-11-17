import type { Color } from '@chessmate/core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { PlayerBar, useTicker } from '@/components/PlayerBar';
import { Pill } from '@/components/social';
import { Card, Label, Screen } from '@/components/ui';
import { checkSquareOf } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { clockRemaining } from '@/lib/playClient';
import { useSpectate } from '@/lib/social/useSpectate';

const REASONS: Record<string, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  abandoned: 'by abandonment',
  aborted: '(aborted)',
};

/** Spectator view of a live game. Read-only, with live clocks. */
export default function WatchScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const s = useSpectate(String(gameId));
  const [orientation, setOrientation] = useState<Color>('w');
  const size = useBoardSize(260);
  useTicker(s.status === 'live' && !!s.clock?.running);

  const top: Color = orientation === 'w' ? 'b' : 'w';
  const players = { w: s.white, b: s.black };
  const ms = (c: Color) => (s.clock ? clockRemaining(s.clock, c, s.clockOffset) : null);
  const last = s.history[s.history.length - 1];

  return (
    <Screen>
      <Stack.Screen options={{ title: s.white && s.black ? `${s.white.name} vs ${s.black.name}` : 'Watch' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size, gap: 4 }}>
          {s.status === 'error' ? (
            <Card>
              <Label>{s.error === 'No such game' ? 'This game has ended or does not exist.' : (s.error ?? 'Could not open this game.')}</Label>
            </Card>
          ) : (
            <>
              <PlayerBar player={players[top]} ms={ms(top)} active={s.clock?.running === top} />
              <Board
                fen={s.fen}
                orientation={orientation}
                size={size}
                lastMove={last ? { from: last.from, to: last.to } : null}
                checkSquare={checkSquareOf(s.fen)}
              />
              <PlayerBar player={players[orientation]} ms={ms(orientation)} active={s.clock?.running === orientation} />
              <Card style={{ marginTop: 8 }}>
                <View style={styles.row}>
                  <Label muted>
                    {s.status === 'connecting'
                      ? 'Connecting...'
                      : s.outcome
                        ? `${s.outcome.result} ${REASONS[s.outcome.reason] ?? s.outcome.reason.replace(/_/g, ' ')}`
                        : `Live · ${s.spectators} watching`}
                  </Label>
                  <Pill title="Flip board" onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
                </View>
                {s.history.length > 0 && (
                  <Label muted size={13}>
                    {s.history
                      .map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san))
                      .join(' ')}
                  </Label>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
