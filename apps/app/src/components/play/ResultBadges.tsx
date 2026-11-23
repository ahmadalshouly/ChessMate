import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { translate, useT, type TKey } from '@/i18n';
import { Text, useColors } from '@/ui';

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

/** "1-0" → ["1", "0"], "1/2-1/2" → ["½", "½"]. */
export function scoreParts(score: string): [string, string] {
  const [l = '', r = ''] = score.replace(/1\/2/g, '½').split('-');
  return [l, r];
}

/** Win, loss or draw from the viewer's side. */
export type EndResult = 'win' | 'loss' | 'draw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** The glyph for how a game ended. A winner's crest always wears the crown. */
const REASON_ICON: Record<string, IconName> = {
  checkmate: 'chess-king',
  resignation: 'flag-variant-outline',
  timeout: 'timer-sand-complete',
  timeout_vs_insufficient: 'timer-sand',
  stalemate: 'chess-king',
  insufficient_material: 'scale-balance',
  threefold_repetition: 'repeat',
  fifty_move_rule: 'counter',
  draw_agreement: 'handshake-outline',
  abandoned: 'account-off-outline',
  aborted: 'close',
};

export function crestIcon(result: EndResult | null, reason: string): IconName {
  if (result === 'win') return 'crown';
  return REASON_ICON[reason] ?? 'chess-king';
}

/** How long the full-screen stamp stays up; the result card enters after it. */
export const STAMP_MS = 1700;

/**
 * The result crest: a glass coin with a double rim, like an engraved medal.
 * - Win: solid ink coin with the crown cut out of it (paper coin in dark mode).
 * - Loss: frosted coin, the reason glyph in a muted tone.
 * - Draw: the rim is split half ink, half paper, around a frosted coin.
 * A specular highlight sits across the top, and `glint` sweeps a band of light over it once.
 */
export function ResultCrest({ result, reason, size = 56, glint = false, delay = 0 }: { result: EndResult | null; reason: string; size?: number; glint?: boolean; delay?: number }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (!glint || reduced) return;
    sweep.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
  }, [glint, reduced, delay, sweep]);
  const band = useAnimatedStyle(() => ({
    opacity: sweep.value === 0 || sweep.value === 1 ? 0 : 1,
    transform: [{ translateX: -size + sweep.value * size * 2 }, { rotate: '20deg' }],
  }));

  const win = result === 'win';
  const draw = result === 'draw';
  const rim = Math.max(2, Math.round(size / 24));
  const gap = Math.max(2, Math.round(size / 22));
  const inner = size - 2 * (rim + gap);
  const discFill = win ? c.accent : c.surfaceStrong;
  const glyph = win ? c.onAccent : result === 'loss' ? c.muted : c.text;
  const dark = c.scheme === 'dark';
  const faint = dark ? 'rgba(255,255,255,0.2)' : 'rgba(12,12,13,0.18)';
  // The highlight is white on the frosted coins; on the ink coin it is a faint sheen so the crown stays crisp.
  const shine = win && !dark ? 'rgba(255,255,255,0.22)' : dark && win ? 'rgba(255,255,255,0.7)' : dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)';

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Outer rim; the gap between rim and coin shows the page, like a mounted medal. A draw splits it diagonally. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size / 2,
            borderWidth: rim,
            borderColor: win ? c.accent : faint,
            ...(draw && { borderLeftColor: c.accent, borderTopColor: c.accent }),
            transform: draw ? [{ rotate: '-45deg' }] : undefined,
          },
        ]}
      />
      {/* The coin. */}
      <View
        style={[
          styles.disc,
          {
            top: rim + gap,
            left: rim + gap,
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: discFill,
            borderColor: win ? (dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)') : c.glassBorder,
            shadowColor: '#000',
            shadowOpacity: win ? 0.28 : 0.1,
            shadowRadius: size / 8,
            shadowOffset: { width: 0, height: size / 20 },
          },
        ]}>
        <LinearGradient colors={[shine, 'transparent']} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={[StyleSheet.absoluteFill, { borderRadius: inner / 2 }]} />
        {/* Engraved inner line. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { margin: Math.max(3, inner / 14), borderRadius: inner / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: win ? (dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)') : c.border },
          ]}
        />
        <MaterialCommunityIcons name={crestIcon(result, reason)} size={Math.round(inner * 0.48)} color={glyph} />
        {glint && (
          <Animated.View pointerEvents="none" style={[styles.glint, { height: inner * 2, top: -inner / 2, width: inner / 4 }, band]}>
            <LinearGradient
              colors={['transparent', win && !dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** "Victory" / "Defeat" / "Draw": the one word on the stamp. */
export function useStampWord(result: EndResult): string {
  const tr = useT();
  return tr(`play.over.stamp.${result}`);
}

/**
 * Engraved small caps over a headline: "RATED · 5+0" above "You won".
 * Uses the brand's Cinzel label face.
 */
export function Eyebrow({ children, align }: { children: ReactNode; align?: 'center' }) {
  return (
    <Text variant="overline" tone="muted" align={align} style={{ letterSpacing: 2 }} numberOfLines={1}>
      {children}
    </Text>
  );
}

/**
 * The scoreline: both players either side of the score, white first, with a dot for each colour.
 * The viewer's own name is in full ink; the opponent's is muted.
 */
export function Scoreline({ white, black, score, you }: { white: string; black: string; score: string; you: 'w' | 'b' | null }) {
  const c = useColors();
  const [l, r] = scoreParts(score);
  const side = (name: string, color: 'w' | 'b', end: boolean) => (
    <View style={[styles.side, end && { justifyContent: 'flex-end' }]}>
      {!end && <View style={[styles.dot, color === 'w' ? { backgroundColor: '#F7F7F5', borderColor: 'rgba(0,0,0,0.25)' } : { backgroundColor: '#0C0C0D', borderColor: 'rgba(255,255,255,0.25)' }]} />}
      <Text variant="label" numberOfLines={1} style={{ flexShrink: 1, color: you === color ? c.text : c.muted, fontWeight: you === color ? '600' : '500' }}>
        {name}
      </Text>
      {end && <View style={[styles.dot, color === 'w' ? { backgroundColor: '#F7F7F5', borderColor: 'rgba(0,0,0,0.25)' } : { backgroundColor: '#0C0C0D', borderColor: 'rgba(255,255,255,0.25)' }]} />}
    </View>
  );
  return (
    <View style={[styles.scoreline, { backgroundColor: c.surfaceSunken, borderColor: c.glassBorder }]}>
      {side(white, 'w', false)}
      <Text variant="figure" style={styles.score}>
        {l}
        <Text variant="figure" tone="muted" style={styles.score}>
          {' – '}
        </Text>
        {r}
      </Text>
      {side(black, 'b', true)}
    </View>
  );
}

/** Crest, eyebrow, headline and detail, with an optional close button: the top of every result card. */
export function ResultHeader({
  result,
  reason,
  eyebrow,
  title,
  detail,
  onClose,
  crestDelay = 0,
}: {
  result: EndResult | null;
  reason: string;
  eyebrow: string;
  title: string;
  detail: string;
  onClose?: () => void;
  crestDelay?: number;
}) {
  const c = useColors();
  const tr = useT();
  return (
    <View style={styles.head}>
      <ResultCrest result={result} reason={reason} size={60} glint={result === 'win'} delay={crestDelay} />
      <View style={{ flex: 1, gap: 1 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Text variant="title" numberOfLines={1} style={{ fontSize: 26, lineHeight: 32 }}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {onClose && (
        <Pressable accessibilityRole="button" accessibilityLabel={tr('game.over.close')} onPress={onClose} hitSlop={8} style={[styles.close, { backgroundColor: c.surfaceSunken }]}>
          <MaterialCommunityIcons name="close" size={18} color={c.text} />
        </Pressable>
      )}
    </View>
  );
}

/** Fades and lifts the result card in once the stamp has cleared. */
export function useCardEntrance(delay: number) {
  const reduced = useReducedMotion();
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) enter.value = withDelay(delay, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [reduced, delay, enter]);
  return useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 18 }] }));
}

const styles = StyleSheet.create({
  disc: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  glint: { position: 'absolute', left: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  scoreline: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  score: { fontSize: 22, lineHeight: 26, letterSpacing: -0.5 },
});
