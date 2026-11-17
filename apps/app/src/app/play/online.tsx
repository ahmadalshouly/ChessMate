import { parseTimeControl, timeCategory, type Color } from '@chessmate/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Board } from '@/components/Board';
import { CreateChallenge, IncomingChallenge, InviteDetails, OutgoingChallenge, challengeEndedText } from '@/components/Challenges';
import { ChatPanel } from '@/components/ChatPanel';
import { PlayerBar, useTicker } from '@/components/PlayerBar';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useGameplayPrefs } from '@/features/settings/useGameplayPrefs';
import { useAuth } from '@/lib/auth';
import { checkSquareOf, useBoardInteraction } from '@/lib/useBoardInteraction';
import { useRecordOnlineGame } from '@/lib/recordGame';
import { useBoardSize } from '@/lib/useBoardSize';
import { useGameChat } from '@/lib/useGameChat';
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
  // Signed-in players connect with their access token; guests with "guest:<name>".
  const { getGameToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    getGameToken().then(setToken, () => {});
  }, [getGameToken]);
  return token ? <OnlineGame token={token} /> : <Screen>{null}</Screen>;
}

function OnlineGame({ token }: { token: string }) {
  // tc: quick-pair time control. mode=friend: set up a challenge (to=<player id> prefills a direct one).
  // challenge=<id>: an invite link was opened.
  const { tc: tcParam, mode, to, challenge: inviteId } = useLocalSearchParams<{ tc?: string; mode?: string; to?: string; challenge?: string }>();
  const timeControl = useMemo(() => parseTimeControl(tcParam ?? '5+0'), [tcParam]);
  const { state, actions, send, subscribe } = useOnlineGame(token);
  const chat = useGameChat(state.gameId, state.me?.id ?? null, send, subscribe);
  useRecordOnlineGame(state, timeControl);
  const size = useBoardSize(300);
  const playing = state.status === 'playing';
  useTicker(playing && !!state.clock?.running);

  const canMove = (c: Color) => playing && c === state.you;
  // Move and resign confirmation follow the user's gameplay settings.
  const prefs = useGameplayPrefs(state.fen, timeCategory(timeControl), actions.move);
  const interaction = useBoardInteraction(state.fen, canMove, prefs.move);
  const history = state.history;
  const last = prefs.pending ?? history[history.length - 1];
  const opp: Color = state.you === 'w' ? 'b' : 'w';
  const players = { w: state.white, b: state.black };
  const me = state.me;
  const challenges = Object.values(state.challenges).filter((c) => c.status === 'pending');
  const incoming = challenges.filter((c) => me && c.to?.id === me.id && c.id !== inviteId);
  const outgoing = challenges.filter((c) => me && c.from.id === me.id);
  const declined = Object.entries(state.challengeEnded).find(([, r]) => r !== 'accepted' && r !== 'cancelled');
  const connected = !!me && state.status !== 'offline' && state.status !== 'connecting';
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
          {state.status === 'idle' &&
            (inviteId ? (
              <InviteDetails
                id={inviteId}
                me={me}
                challenge={state.challenges[inviteId]}
                ended={state.challengeEnded[inviteId]}
                error={state.error}
                connected={connected}
                actions={actions}
              />
            ) : mode === 'friend' ? (
              outgoing.length > 0 ? (
                outgoing.map((c) => <OutgoingChallenge key={c.id} challenge={c} actions={actions} />)
              ) : (
                <>
                  {declined && <Label muted>{challengeEndedText(declined[1])}.</Label>}
                  <CreateChallenge me={me} actions={actions} initialTo={to} initialTc={tcParam ? timeControl : undefined} />
                </>
              )
            ) : (
              <Button title={`Find a ${tcParam ?? '5+0'} game`} onPress={() => actions.seek(timeControl)} />
            ))}
          {(state.status === 'idle' || state.status === 'seeking' || state.status === 'finished') &&
            incoming.map((c) => <IncomingChallenge key={c.id} challenge={c} actions={actions} />)}
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
              <Button variant="danger" title={prefs.resignAsked ? 'Confirm resign' : 'Resign'} onPress={() => prefs.requestResign() && actions.resign()} />
              {prefs.resignAsked && <Button variant="secondary" title="Keep playing" onPress={prefs.cancelResign} />}
            </View>
          )}
          {playing && prefs.pending && (
            <View style={styles.actions}>
              <Label>Play {prefs.pending.san}?</Label>
              <Button title="Confirm move" onPress={prefs.confirm} />
              <Button variant="secondary" title="Cancel" onPress={prefs.cancel} />
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
              {state.gameId && state.outcome.reason !== 'aborted' && (
                <Button variant="secondary" title="Review in game history" onPress={() => router.push({ pathname: '/games/[id]', params: { id: `on_${state.gameId}` } })} />
              )}
              {history.length > 0 && (
                <Button
                  variant="secondary"
                  title="Engine review"
                  onPress={() =>
                    router.push({
                      pathname: '/review',
                      params: { gameId: state.gameId ?? '', moves: history.map((m) => m.uci).join(','), orientation: state.you },
                    })
                  }
                />
              )}
            </>
          )}
          {state.error && <Label muted>{state.error}</Label>}
          {history.length > 0 && (
            <Label muted>
              {history.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ')}
            </Label>
          )}
        </Card>
        {state.gameId && <ChatPanel chat={chat} me={state.me} opponent={players[opp]} canChat={playing || state.status === 'finished'} />}
      </View>
    </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
});
