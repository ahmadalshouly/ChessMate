import type { ReviewedMove } from '@chessmate/core';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MoveBadge } from '@/components/MoveBadge';
import { MOVE_CLASS } from '@/constants/analysis';
import { useT } from '@/i18n';
import { GlassView, Text, rimShadow, useAppTheme } from '@/ui';

import { useSmoothProgress } from './smoothProgress';

const BAR = 14;
/** Where the game's phases start, as a share of the positions graded (grading runs in game order). */
const STAGES = [
  { key: 'opening', from: 0 },
  { key: 'middlegame', from: 0.2 },
  { key: 'endgame', from: 0.7 },
  { key: 'accuracy', from: 0.98 },
] as const;

export interface ReviewProgressProps {
  done: number;
  total: number;
  /** Looking up a saved review before grading. */
  checking?: boolean;
  /** Grading finished: the card shows a short "ready" state, then the caller removes it. */
  finished?: boolean;
  tookMs?: number | null;
  /** The last move graded so far, shown as a ticker under the bar. */
  latest?: ReviewedMove;
  /** Whose engine is grading: this device's (default) or the server's. */
  where?: 'device' | 'server' | null;
  /** Replaces the "Reviewing your game" heading while grading (a Deep review). */
  title?: string;
}

/**
 * The reviewing card: a big percentage, a thick glass progress bar with a
 * light sweeping through its fill, the phase of the game being graded
 * (opening, middlegame, endgame, then accuracy), and the most recent graded
 * move ticking in with its badge. Monochrome, like the rest of the app; only
 * the move badges carry colour.
 */
export function ReviewProgress({ done, total, checking, finished, tookMs, latest, where, title }: ReviewProgressProps) {
  const tr = useT();
  const t = useAppTheme();
  const c = t.colors;
  const reduced = useReducedMotion();
  // Moves steadily between results instead of pausing and then jumping.
  const share = useSmoothProgress(done, total, { active: !checking, finished });
  const pct = Math.round(share * 100);
  const [trackW, setTrackW] = useState(0);

  // The fill eases to each new value instead of jumping.
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(Math.max(0.02, share), { duration: reduced ? 0 : 140, easing: Easing.linear });
  }, [share, reduced, fill]);
  // Pixels, not percent: percentage widths do not animate reliably on the web.
  const fillStyle = useAnimatedStyle(() => ({ width: fill.value * trackW }));

  // A soft highlight sweeps through the fill while the engine works.
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduced || finished) {
      cancelAnimation(sweep);
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(sweep);
  }, [reduced, finished, sweep]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + sweep.value * (trackW + 240) }] }));

  // The check pops in when grading is done.
  const pop = useSharedValue(finished ? 1 : 0);
  useEffect(() => {
    if (!finished) return;
    pop.value = reduced ? 1 : withSequence(withTiming(1.18, { duration: 180 }), withTiming(1, { duration: 160 }));
  }, [finished, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(1, pop.value) }));

  const stage = finished ? STAGES.length : STAGES.reduce((at, s, i) => (share >= s.from ? i : at), 0);
  const ink = c.text;
  const onInk = c.textInverse;

  return (
    <GlassView strength="strong" radius="xl" padding="lg" style={styles.card} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="overline" tone="muted">
            {checking ? tr('review.progressCard.checking') : finished ? tr('review.progressCard.ready') : (title ?? tr('review.progressCard.title'))}
          </Text>
          <Text variant="heading" numberOfLines={1}>
            {finished
              ? tookMs
                ? tr('review.progressCard.tookS', { s: (tookMs / 1000).toFixed(1) })
                : tr('review.progressCard.done')
              : checking
                ? tr('review.progressCard.lookingUp')
                : tr(`review.progressCard.stage.${STAGES[Math.min(stage, STAGES.length - 1)]!.key}`)}
          </Text>
        </View>
        {finished ? (
          <Animated.View style={[styles.check, { backgroundColor: ink }, popStyle]}>
            <MaterialCommunityIcons name="check-bold" size={26} color={onInk} />
          </Animated.View>
        ) : (
          <View style={styles.pctWrap}>
            <Text style={[styles.pct, { color: ink, fontFamily: t.fonts.monoBold }]}>{checking ? '–' : pct}</Text>
            <Text style={[styles.pctSign, { color: c.muted, fontFamily: t.fonts.mono }]}>%</Text>
          </View>
        )}
      </View>

      <View
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        style={[styles.track, { backgroundColor: c.surfaceSunken, borderColor: c.glassBorder }, rimShadow(c)]}>
        <Animated.View style={[styles.fill, { backgroundColor: ink }, fillStyle]}>
          {!reduced && !finished && (
            <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none">
              <LinearGradient
                colors={t.scheme === 'dark' ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
        </Animated.View>
        {/* Phase marks along the track. */}
        {STAGES.slice(1, 3).map((s) => (
          <View key={s.key} pointerEvents="none" style={[styles.tick, { left: `${s.from * 100}%`, backgroundColor: share > s.from ? onInk : c.borderStrong }]} />
        ))}
      </View>

      <View style={styles.stages}>
        {STAGES.map((s, i) => {
          const state = i < stage ? 'done' : i === stage ? 'now' : 'next';
          return (
            <View key={s.key} style={styles.stage}>
              <View
                style={[
                  styles.dot,
                  state === 'done' && { backgroundColor: ink, borderColor: ink },
                  state === 'now' && { borderColor: ink },
                  state === 'next' && { borderColor: c.borderStrong },
                ]}>
                {state === 'done' && <MaterialCommunityIcons name="check" size={9} color={onInk} />}
              </View>
              <Text
                variant="caption"
                tone={state === 'next' ? 'tertiary' : undefined}
                style={[styles.stageLabel, state === 'now' && { fontFamily: t.fonts.sansSemiBold }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}>
                {tr(`review.progressCard.short.${s.key}`)}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.foot}>
        {latest && !finished ? (
          <Animated.View key={latest.ply} entering={reduced ? undefined : FadeInDown.duration(220)} exiting={reduced ? undefined : FadeOut.duration(120)} style={styles.ticker}>
            <MoveBadge cls={latest.judgement.classification} size={20} />
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {latest.color === 'w' ? `${Math.ceil(latest.ply / 2)}.` : `${Math.ceil(latest.ply / 2)}…`} {latest.san}
              <Text variant="label" tone="muted">
                {'  '}
                {MOVE_CLASS[latest.judgement.classification].label}
              </Text>
            </Text>
          </Animated.View>
        ) : (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={styles.ticker}>
            <MaterialCommunityIcons name={checking ? 'cloud-search-outline' : where === 'server' ? 'cloud-cog-outline' : 'cellphone-cog'} size={16} color={c.muted} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {checking
                ? tr('review.progressCard.savedHint')
                : where === 'server'
                  ? finished
                    ? tr('review.progressCard.serverDone')
                    : tr('review.progressCard.server')
                  : finished
                    ? tr('review.progressCard.deviceDone')
                    : tr('review.progressCard.device')}
            </Text>
          </Animated.View>
        )}
        {!checking && total > 0 && (
          <Text variant="caption" tone="muted" style={{ fontFamily: t.fonts.mono }}>
            {finished ? total : Math.min(done, total)}/{total}
          </Text>
        )}
      </View>
    </GlassView>
  );
}

/**
 * A soft band of light that scans down the board while the engine grades
 * the game. Sits over the board, never takes touches, and stays off for
 * Reduce Motion.
 */
export function BoardScan({ size, active }: { size: number; active: boolean }) {
  const t = useAppTheme();
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  const on = active && !reduced;
  useEffect(() => {
    if (!on) {
      cancelAnimation(y);
      return;
    }
    y.value = 0;
    y.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(y);
  }, [on, y]);
  const band = size * 0.22;
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -band / 2 + y.value * size }] }));
  if (!on) return null;
  const glow = t.scheme === 'dark' ? '255,255,255' : '250,250,252';
  return (
    <Animated.View pointerEvents="none" entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 4 }]}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, height: band }, style]}>
        <LinearGradient colors={[`rgba(${glow},0)`, `rgba(${glow},0.22)`, `rgba(${glow},0)`]} style={StyleSheet.absoluteFill} />
        <View style={[styles.scanLine, { top: band / 2, backgroundColor: `rgba(${glow},0.55)` }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pctWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  pct: { fontSize: 44, lineHeight: 48, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  pctSign: { fontSize: 18, marginTop: 6, marginStart: 2 },
  check: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  track: { height: BAR, borderRadius: BAR / 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  fill: { height: '100%', borderRadius: BAR / 2, overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: 120 },
  tick: { position: 'absolute', top: 3, bottom: 3, width: 2, marginStart: -1, borderRadius: 1, opacity: 0.6 },
  stages: { flexDirection: 'row', gap: 4 },
  stage: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
  stageLabel: { fontSize: 11, textAlign: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  ticker: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  scanLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2 },
});
