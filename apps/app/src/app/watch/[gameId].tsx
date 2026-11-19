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
import { reasonText } from '@/components/play/GameOverCard';
import { translate, useT } from '@/i18n';

const reasonFor = (reason: string) => (reason === 'abandoned' ? translate('watch.byAbandonment') : reason === 'aborted' ? translate('watch.aborted') : reasonText(reason));

/** Spectator view of a live game. Read-only, with live clocks. */
export default function WatchScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const s = useSpectate(String(gameId));
  const tr = useT();
  const [orientation, setOrientation] = useState<Color>('w');
  const size = useBoardSize(260);
  const now = useTicker(s.status === 'live' && !!s.clock?.running);

  const top: Color = orientation === 'w' ? 'b' : 'w';
  const players = { w: s.white, b: s.black };
  const ms = (c: Color) => (s.clock ? clockRemaining(s.clock, c, s.clockOffset, now) : null);
  const last = s.history[s.history.length - 1];

  return (
    <Screen>
      <Stack.Screen options={{ title: s.white && s.black ? tr('watch.title', { white: s.white.name, black: s.black.name }) : tr('watch.watch') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={{ width: size, gap: 4 }}>
          {s.status === 'error' ? (
            <Card>
              <Label>{s.error === 'No such game' ? tr('watch.ended') : (s.error ?? tr('watch.couldNotOpen'))}</Label>
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
                      ? tr('play.connecting')
                      : s.outcome
                        ? `${s.outcome.result} ${reasonFor(s.outcome.reason)}`
                        : tr('watch.live', { count: s.spectators })}
                  </Label>
                  <Pill title={tr('common.flipBoard')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
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
