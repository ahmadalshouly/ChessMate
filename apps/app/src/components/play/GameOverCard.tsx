import { formatTimeControl, type Color, type TournamentSponsor } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { Text } from '@/ui/primitives';

import { pickIndex } from '@/components/play/GameEndCelebration';
import { ResultHeader, Scoreline, STAMP_MS, reasonText, useCardEntrance, type EndResult } from '@/components/play/ResultBadges';
import { ReviewPill } from '@/components/ReviewButton';
import { Label } from '@/components/ui';
import { AdSpot } from '@/features/ads/AdSpot';
import { SponsorBadge } from '@/features/tournaments/SponsorBadge';
import { useTheme } from '@/constants/theme';
import { translate, useT } from '@/i18n';
import type { GameView } from '@/lib/playClient';

export { reasonText };

export function resultHeadline(view: GameView): { title: string; detail: string } {
  const o = view.outcome;
  if (!o) return { title: '', detail: '' };
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
  reviewLabel,
  onClose,
  sponsor,
  onTournament,
}: {
  view: GameView;
  onRematch: () => void;
  onDeclineRematch: () => void;
  onNewGame: () => void;
  onLobby: () => void;
  /** Opens the full engine review; hidden for aborted games. It is the card's main action. */
  onReview?: () => void;
  /** Replaces "Review game": the accuracy once the game is reviewed, or "Sign in to review". */
  reviewLabel?: string;
  /** Hides the card to look at the final position. */
  onClose?: () => void;
  /** Tournament games: the sponsor, shown under the score. */
  sponsor?: TournamentSponsor | null;
  /** Tournament games: back to the tournament (standings, next pairing). */
  onTournament?: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const reduced = useReducedMotion();
  const { title, detail } = resultHeadline(view);
  const result = endResult(view);
  const opp: Color = view.you === 'w' ? 'b' : 'w';
  const change = view.ratingChange?.[view.you];
  const delta = change ? Math.round(change.after.rating) - Math.round(change.before.rating) : null;
  const oppOffered = view.rematchBy === opp;
  const iOffered = view.rematchBy === view.you;
  const tc = formatTimeControl(view.timeControl);
  const opponent = view.you === 'w' ? view.black : view.white;
  const canReview = !!onReview && view.outcome!.reason !== 'aborted';

  // The result stamp has its moment first, then the card lifts in.
  const enterStyle = useCardEntrance(result ? STAMP_MS : 250);

  return (
    <Animated.View style={[styles.solid, { backgroundColor: t.surfaceSolid, borderColor: t.glassBorder }, enterStyle]}>
      <ResultHeader
        result={result}
        reason={view.outcome!.reason}
        eyebrow={`${view.rated ? tr('play.rated') : tr('play.casual')} · ${tc}`}
        title={title}
        detail={detail}
        onClose={onClose}
        crestDelay={reduced ? 0 : (result ? STAMP_MS : 250) + 300}
      />
      <Scoreline white={view.white.name} black={view.black.name} score={view.outcome!.result} you={view.you} />
      {sponsor ? (
        <View style={[styles.sponsor, { borderColor: t.glassBorder, backgroundColor: t.surfaceSunken }]}>
          <SponsorBadge sponsor={sponsor} size="md" align="center" />
        </View>
      ) : null}
      {result && <Text style={[styles.line, { color: t.text }]}>{endLine(result, view.gameId)}</Text>}
      {change && delta !== null ? (
        <View style={[styles.rating, { borderColor: t.glassBorder, backgroundColor: t.surfaceSunken }]}>
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
      {onTournament && (
        <View style={styles.buttons}>
          <CardButton icon="trophy-outline" label={tr('tournaments.back')} onPress={onTournament} primary={!canReview} />
        </View>
      )}
      {canReview && (
        <View style={styles.buttons}>
          <ReviewPill label={reviewLabel ?? tr('play.over.reviewGame')} onPress={onReview!} flex />
        </View>
      )}
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
            primary={!canReview}
          />
        )}
      </View>
      <View style={styles.buttons}>
        <CardButton icon="plus-circle-outline" label={tr('play.over.newGame', { tc })} onPress={onNewGame} />
        <CardButton icon="home-outline" label={tr('play.over.lobby')} onPress={onLobby} />
      </View>
      {/* A sold spot, below the actions. Skipped on tournament games, which already name their own sponsor. */}
      {!sponsor && <AdSpot spot="game.over" />}
    </Animated.View>
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
  solid: { width: '100%', maxWidth: 460, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  line: { fontSize: 15, fontWeight: '500', lineHeight: 21 },
  sponsor: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  ratingValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], marginStart: 'auto' },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  deltaText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  btnText: { fontSize: 14, fontWeight: '600' },
});
