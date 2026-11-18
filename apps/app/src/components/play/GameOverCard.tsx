import Ionicons from '@expo/vector-icons/Ionicons';
import { formatTimeControl, type Color } from '@chessmate/core';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui/primitives';

import { pickIndex, type EndResult } from '@/components/play/GameEndCelebration';
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

/** Win, loss or draw from the viewer's side; null for an aborted game. */
export function endResult(view: GameView): EndResult | null {
  const o = view.outcome;
  if (!o || o.reason === 'aborted') return null;
  return o.winner === null ? 'draw' : o.winner === view.you ? 'win' : 'loss';
}

const LINES = ['a', 'b', 'c', 'd'] as const;

/** A cheer for the winner, a comforting word for the loser. Stable per game. */
export function endLine(result: EndResult, gameId: string): string {
  if (result === 'draw') return translate('play.over.drawLine');
  const k = LINES[pickIndex(gameId, LINES.length)]!;
  return translate(result === 'win' ? `play.over.cheer.${k}` : `play.over.comfort.${k}`);
}

/** Why ratings did not move, in words. */
export function unratedText(reason: string | undefined): string {
  switch (reason) {
    case 'casual':
    case 'guest':
    case 'too_short':
    case 'aborted':
      return translate(`play.over.unrated.${reason}`);
    default:
      return translate('play.over.unrated.other');
  }
}

/** Result, rating change and next steps, shown over the board when a game ends. */
export function GameOverCard({
  view,
  onRematch,
  onDeclineRematch,
  onNewGame,
  onLobby,
  onReview,
}: {
  view: GameView;
  onRematch: () => void;
  onDeclineRematch: () => void;
  onNewGame: () => void;
  onLobby: () => void;
  /** Offered to the loser as a constructive next step. */
  onReview?: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const reduced = useReducedMotion();
  const { title, detail } = resultHeadline(view);
  const result = endResult(view);
  const checkmate = view.outcome!.reason === 'checkmate';
  const opp: Color = view.you === 'w' ? 'b' : 'w';
  const change = view.ratingChange?.[view.you];
  const delta = change ? Math.round(change.after.rating) - Math.round(change.before.rating) : null;
  const oppOffered = view.rematchBy === opp;
  const iOffered = view.rematchBy === view.you;
  const tc = formatTimeControl(view.timeControl);
  const opponent = view.you === 'w' ? view.black : view.white;

  // Enter after the checkmate stamp has had its moment.
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) enter.value = withDelay(checkmate ? 1450 : 250, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [reduced, checkmate, enter]);
  const enterStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 18 }] }));
  const icon = result === 'win' ? 'trophy' : result === 'loss' ? 'heart' : result === 'draw' ? 'git-compare-outline' : 'close-circle-outline';

  return (
    <Animated.View style={[styles.solid, { backgroundColor: t.surfaceSolid }, enterStyle]}>
    <Card style={styles.card}>
      <View style={styles.head}>
        <Medallion icon={icon} bounce={result === 'win' && !reduced} delay={checkmate ? 1700 : 450} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <Label muted>
            {detail} · {view.outcome!.result}
          </Label>
        </View>
      </View>
      {result && <Text style={[styles.line, { color: t.text }]}>{endLine(result, view.gameId)}</Text>}
      <View style={styles.meta}>
        <Label muted>
          {tr('play.over.vs', { tc, mode: view.rated ? tr('play.rated') : tr('play.casual'), name: opponent.name })}
        </Label>
      </View>
      {change && delta !== null ? (
        <View style={[styles.rating, { borderColor: t.glassBorder, backgroundColor: t.surface }]}>
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr('play.over.newRating')}</Text>
          <Text style={[styles.ratingValue, { color: t.text }]}>{Math.round(change.after.rating)}</Text>
          <View style={[styles.delta, { backgroundColor: delta > 0 ? t.successSoft : delta < 0 ? t.dangerSoft : t.surface }]}>
            <Ionicons name={delta > 0 ? 'caret-up' : delta < 0 ? 'caret-down' : 'remove'} size={12} color={delta > 0 ? t.success : delta < 0 ? t.danger : t.muted} />
            <Text style={[styles.deltaText, { color: delta > 0 ? t.success : delta < 0 ? t.danger : t.muted }]}>
              {delta > 0 ? '+' : ''}
              {delta}
            </Text>
          </View>
        </View>
      ) : (
        result && <Label muted>{unratedText(view.unrated ?? (view.rated ? undefined : 'casual'))}</Label>
      )}
      {oppOffered && <Label bold>{tr('play.over.wantsRematch', { name: opponent.name })}</Label>}
      {iOffered && <Label muted>{tr('play.over.rematchWaiting', { name: opponent.name })}</Label>}
      {view.rematchDeclined && <Label muted>{tr('play.over.declined')}</Label>}
      <View style={styles.buttons}>
        {result === 'loss' && onReview && <Button title={tr('play.over.review')} onPress={onReview} />}
        {oppOffered ? (
          <>
            <Button title={tr('play.over.acceptRematch')} onPress={onRematch} />
            <Button variant="secondary" title={tr('common.decline')} onPress={onDeclineRematch} />
          </>
        ) : (
          <Button
            variant={result === 'loss' && onReview ? 'secondary' : 'primary'}
            title={iOffered ? tr('play.over.rematchOffered') : tr('play.over.rematch')}
            disabled={iOffered || view.rematchDeclined || !view.opponentConnected}
            onPress={onRematch}
          />
        )}
        <Button variant="secondary" title={tr('play.over.newGame', { tc })} onPress={onNewGame} />
        <Button variant="secondary" title={tr('play.over.lobby')} onPress={onLobby} />
      </View>
    </Card>
    </Animated.View>
  );
}

/** Glass coin with the result icon; a winner's trophy pops and wiggles. */
function Medallion({ icon, bounce, delay }: { icon: keyof typeof Ionicons.glyphMap; bounce: boolean; delay: number }) {
  const t = useTheme();
  const s = useSharedValue(bounce ? 0.4 : 1);
  const r = useSharedValue(0);
  useEffect(() => {
    if (!bounce) return;
    s.value = withDelay(delay, withSpring(1, { damping: 7, stiffness: 160 }));
    r.value = withDelay(delay + 120, withSequence(withTiming(-14, { duration: 110 }), withTiming(12, { duration: 140 }), withTiming(-6, { duration: 120 }), withTiming(0, { duration: 120 })));
  }, [bounce, delay, s, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[styles.medal, { borderColor: t.glassBorder, backgroundColor: t.surfaceStrong }, style]}>
      <Ionicons name={icon} size={24} color={t.text} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  solid: { width: '100%', borderRadius: 20 },
  card: { width: '100%' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medal: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  line: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  ratingValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], marginStart: 'auto' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  deltaText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
