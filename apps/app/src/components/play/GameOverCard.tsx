import { formatTimeControl, type Color } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Button, Card, Label } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { translate, useT, type TKey } from '@/i18n';
import type { GameView } from '@/lib/playClient';

const REASONS = new Set([
  'checkmate',
  'resignation',
  'timeout',
  'timeout_vs_insufficient',
  'stalemate',
  'insufficient_material',
  'threefold_repetition',
  'fifty_move_rule',
  'draw_agreement',
  'abandoned',
  'aborted',
]);

/** "by checkmate", "on time", … for a game-end reason code. */
export function reasonText(reason: string): string {
  return REASONS.has(reason) ? translate(`play.reason.${reason}` as TKey) : reason.replace(/_/g, ' ');
}

export function resultHeadline(view: GameView): { title: string; detail: string } {
  const o = view.outcome!;
  const youLeft = o.reason === 'abandoned' && o.winner !== view.you;
  const title =
    o.reason === 'aborted' ? translate('play.result.aborted') : o.winner === null ? translate('play.result.draw') : o.winner === view.you ? translate('play.result.won') : translate('play.result.lost');
  const detail = youLeft ? translate('play.reason.youLeft') : reasonText(o.reason);
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
  const tr = useT();
  const { title, detail } = resultHeadline(view);
  const opp: Color = view.you === 'w' ? 'b' : 'w';
  const change = view.ratingChange?.[view.you];
  const delta = change ? Math.round(change.after.rating) - Math.round(change.before.rating) : null;
  const oppOffered = view.rematchBy === opp;
  const iOffered = view.rematchBy === view.you;
  const tc = formatTimeControl(view.timeControl);
  const opponent = view.you === 'w' ? view.black : view.white;

  return (
    <View style={[styles.solid, { backgroundColor: t.surfaceSolid }]}>
    <Card style={styles.card}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      <Label muted>
        {detail} · {view.outcome!.result}
      </Label>
      <View style={styles.meta}>
        <Label muted>
          {tr('play.over.vs', { tc, mode: view.rated ? tr('play.rated') : tr('play.casual'), name: opponent.name })}
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
      {oppOffered && <Label bold>{tr('play.over.wantsRematch', { name: opponent.name })}</Label>}
      {iOffered && <Label muted>{tr('play.over.rematchWaiting', { name: opponent.name })}</Label>}
      {view.rematchDeclined && <Label muted>{tr('play.over.declined')}</Label>}
      <View style={styles.buttons}>
        {oppOffered ? (
          <>
            <Button title={tr('play.over.acceptRematch')} onPress={onRematch} />
            <Button variant="secondary" title={tr('common.decline')} onPress={onDeclineRematch} />
          </>
        ) : (
          <Button title={iOffered ? tr('play.over.rematchOffered') : tr('play.over.rematch')} disabled={iOffered || view.rematchDeclined || !view.opponentConnected} onPress={onRematch} />
        )}
        <Button variant="secondary" title={tr('play.over.newGame', { tc })} onPress={onNewGame} />
        <Button variant="secondary" title={tr('play.over.lobby')} onPress={onLobby} />
      </View>
    </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  solid: { width: '100%', borderRadius: 20 },
  card: { width: '100%' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  delta: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  deltaText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
