import { formatTimeControl, type Color } from '@chessmate/core';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import type { GameView } from '@/lib/playClient';

const REASONS: Record<string, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  timeout_vs_insufficient: 'timeout vs insufficient material',
  stalemate: 'by stalemate',
  insufficient_material: 'by insufficient material',
  threefold_repetition: 'by threefold repetition',
  fifty_move_rule: 'by the fifty-move rule',
  draw_agreement: 'by agreement',
  abandoned: 'opponent left the game',
  aborted: 'before the first moves',
};

export function resultHeadline(view: GameView): { title: string; detail: string } {
  const o = view.outcome!;
  const youLeft = o.reason === 'abandoned' && o.winner !== view.you;
  const title = o.reason === 'aborted' ? 'Game aborted' : o.winner === null ? 'Draw' : o.winner === view.you ? 'You won' : 'You lost';
  const detail = youLeft ? 'you left the game' : (REASONS[o.reason] ?? o.reason.replace(/_/g, ' '));
  return { title, detail };
}

/** Result, rating change and next steps, shown over the board when a game ends. */
export function GameOverCard({
  view,
  onRematch,
  onDeclineRematch,
  onNewGame,
  onLobby,
}: {
  view: GameView;
  onRematch: () => void;
  onDeclineRematch: () => void;
  onNewGame: () => void;
  onLobby: () => void;
}) {
  const t = useTheme();
  const { title, detail } = resultHeadline(view);
  const opp: Color = view.you === 'w' ? 'b' : 'w';
  const change = view.ratingChange?.[view.you];
  const delta = change ? Math.round(change.after.rating) - Math.round(change.before.rating) : null;
  const oppOffered = view.rematchBy === opp;
  const iOffered = view.rematchBy === view.you;
  const tc = formatTimeControl(view.timeControl);
  const opponent = view.you === 'w' ? view.black : view.white;

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      <Label muted>
        {detail} · {view.outcome!.result}
      </Label>
      <View style={styles.meta}>
        <Label muted>
          {tc} · {view.rated ? 'Rated' : 'Casual'} vs {opponent.name}
        </Label>
        {change && delta !== null && (
          <View style={[styles.delta, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
            <Text style={[styles.deltaText, { color: t.text }]}>
              {Math.round(change.after.rating)} ({delta >= 0 ? '+' : ''}
              {delta})
            </Text>
          </View>
        )}
      </View>
      {oppOffered && <Label bold>{opponent.name} wants a rematch.</Label>}
      {iOffered && <Label muted>Rematch offered. Waiting for {opponent.name}…</Label>}
      {view.rematchDeclined && <Label muted>Rematch declined.</Label>}
      <View style={styles.buttons}>
        {oppOffered ? (
          <>
            <Button title="Accept rematch" onPress={onRematch} />
            <Button variant="secondary" title="Decline" onPress={onDeclineRematch} />
          </>
        ) : (
          <Button title={iOffered ? 'Rematch offered' : 'Rematch'} disabled={iOffered || view.rematchDeclined || !view.opponentConnected} onPress={onRematch} />
        )}
        <Button variant="secondary" title={`New ${tc}`} onPress={onNewGame} />
        <Button variant="secondary" title="Lobby" onPress={onLobby} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  delta: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  deltaText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
