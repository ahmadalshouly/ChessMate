import { parseTimeControl, type Color } from '@chessmate/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { PlayerBar, useTicker } from '@/components/PlayerBar';
import { Button, Card, Label, Screen } from '@/components/ui';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useBoardSize } from '@/lib/useBoardSize';
import { clockRemaining, useOnlineGame } from '@/lib/useOnlineGame';

const REASONS: Record<string, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  timeout_vs_insufficient: 'timeout vs insufficient material',
  stalemate: 'by stalemate',
  insufficient_material: 'insufficient material',
  threefold_repetition: 'threefold repetition',
  fifty_move_rule: 'fifty-move rule',
  draw_agreement: 'by agreement',
  abandoned: 'opponent left',
  aborted: 'game aborted',
};

export default function OnlinePlay() {
  const { tc: tcParam } = useLocalSearchParams<{ tc?: string }>();
  const timeControl = useMemo(() => parseTimeControl(tcParam ?? '5+0'), [tcParam]);
  // Guest identity until accounts land.
  const [token] = useState(() => `guest:Guest${Math.floor(Math.random() * 9000 + 1000)}`);
  const { state, actions } = useOnlineGame(token);
  const size = useBoardSize(300);
  const playing = state.status === 'playing';
  useTicker(playing && !!state.clock?.running);

  const canMove = (c: Color) => playing && c === state.you;
  const interaction = useBoardInteraction(state.fen, canMove, actions.move);
  const history = state.history;
  const last = history[history.length - 1];
  const opp: Color = state.you === 'w' ? 'b' : 'w';
  const players = { w: state.white, b: state.black };
  const ms = (c: Color) => (state.clock ? clockRemaining(state.clock, c, state.clockOffset) : null);

  return (
    <Screen>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={{ width: size }}>
        <PlayerBar player={players[opp]} ms={ms(opp)} active={state.clock?.running === opp} offline={!state.opponentConnected} />
        <Board
          fen={state.fen}
          orientation={state.you}
          size={size}
          selected={interaction.selected}
          targets={interaction.targets}
          lastMove={last ? { from: last.from, to: last.to } : null}
          checkSquare={checkSquareOf(state.fen)}
          onSquarePress={interaction.onSquarePress}
        />
        <PlayerBar player={state.me && players[state.you]} ms={ms(state.you)} active={state.clock?.running === state.you} />

        <Card style={{ marginTop: 12 }}>
          {state.status === 'connecting' && <Label muted>Connecting to the game server...</Label>}
          {state.status === 'offline' && <Label muted>Server unreachable. Retrying...</Label>}
          {state.status === 'idle' && <Button title={`Find a ${tcParam ?? '5+0'} game`} onPress={() => actions.seek(timeControl)} />}
          {state.status === 'seeking' && (
            <>
              <Label>Looking for an opponent...</Label>
              <Button variant="secondary" title="Cancel" onPress={actions.cancelSeek} />
            </>
          )}
          {playing && (
            <View style={styles.actions}>
              {history.length < 2 ? (
                <Button variant="secondary" title="Abort" onPress={actions.abort} />
              ) : (
                <Button variant="secondary" title="Offer draw" onPress={actions.offerDraw} disabled={state.drawOfferBy === state.you} />
              )}
              <Button variant="danger" title="Resign" onPress={actions.resign} />
            </View>
          )}
          {playing && state.drawOfferBy === opp && (
            <View style={styles.actions}>
              <Label>Your opponent offers a draw.</Label>
              <Button title="Accept" onPress={actions.acceptDraw} />
              <Button variant="secondary" title="Decline" onPress={actions.declineDraw} />
            </View>
          )}
          {state.status === 'finished' && state.outcome && (
            <>
              <Label size={18} bold>
                {state.outcome.winner === null ? 'Draw' : state.outcome.winner === state.you ? 'You won' : 'You lost'} · {REASONS[state.outcome.reason] ?? state.outcome.reason}
              </Label>
              <Button title="New game" onPress={actions.newGame} />
            </>
          )}
          {state.error && <Label muted>{state.error}</Label>}
          {history.length > 0 && (
            <Label muted>
              {history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}
            </Label>
          )}
        </Card>
      </View>
    </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
});
