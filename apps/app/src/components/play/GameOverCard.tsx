import { formatTimeControl, type Color } from '@chessmate/core';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { Label } from '@/components/ui';
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
  onReview,
  onClose,
}: {
  view: GameView;
  onRematch: () => void;
  onDeclineRematch: () => void;
  onNewGame: () => void;
  onLobby: () => void;
  /** Opens the engine review; hidden for aborted games. */
  onReview?: () => void;
  /** Hides the card to look at the final position. */
  onClose?: () => void;
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
  const canReview = !!onReview && view.outcome!.reason !== 'aborted';

  return (
    <View style={[styles.solid, { backgroundColor: t.surfaceSolid, borderColor: t.glassBorder }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Label muted>
            {detail} · {view.outcome!.result}
          </Label>
        </View>
        {onClose && (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('game.over.close')} onPress={onClose} hitSlop={8} style={[styles.close, { backgroundColor: t.surfaceSunken }]}>
            <MaterialCommunityIcons name="close" size={18} color={t.text} />
          </Pressable>
        )}
      </View>
      <View style={styles.meta}>
        <View style={{ flex: 1 }}>
          <Label muted size={13}>
            {tr('play.over.vs', { tc, mode: view.rated ? tr('play.rated') : tr('play.casual'), name: opponent.name })}
          </Label>
        </View>
        {change && delta !== null && (
          <View style={[styles.delta, { borderColor: t.glassBorder, backgroundColor: t.surfaceSunken }]}>
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
            <CardButton icon="check" label={tr('play.over.acceptRematch')} onPress={onRematch} primary />
            <CardButton icon="close" label={tr('common.decline')} onPress={onDeclineRematch} />
          </>
        ) : (
          <CardButton
            icon="refresh"
            label={iOffered ? tr('play.over.rematchOffered') : tr('play.over.rematch')}
            disabled={iOffered || view.rematchDeclined || !view.opponentConnected}
            onPress={onRematch}
            primary
          />
        )}
        {canReview && <CardButton icon="chart-box-outline" label={tr('game.action.review')} onPress={onReview!} />}
      </View>
      <View style={styles.buttons}>
        <CardButton icon="plus-circle-outline" label={tr('play.over.newGame', { tc })} onPress={onNewGame} />
        <CardButton icon="home-outline" label={tr('play.over.lobby')} onPress={onLobby} />
      </View>
    </View>
  );
}

/** Equal-width button with an icon and label centred together. */
function CardButton({ icon, label, onPress, primary, disabled }: { icon: ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const t = useTheme();
  const fg = primary ? t.onAccent : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: primary ? t.accent : t.surfaceSunken, borderColor: primary ? t.accent : t.border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}>
      <MaterialCommunityIcons name={icon} size={18} color={fg} />
      <Text style={[styles.btnText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  solid: { width: '100%', maxWidth: 400, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delta: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  deltaText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  btnText: { fontSize: 14, fontWeight: '600' },
});
