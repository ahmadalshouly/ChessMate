import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Eyebrow, ResultCrest, STAMP_MS, reasonText, scoreParts, useStampWord, type EndResult } from '@/components/play/ResultBadges';
import { GlassView, Text, useColors } from '@/ui';

export type { EndResult };

/** Small deterministic PRNG so a game always gets the same confetti and message. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Index 0..n-1 picked from the seed, for choosing a cheer or comfort line. */
export function pickIndex(seed: string, n: number): number {
  return Math.floor(seeded(seed)() * n) % n;
}

const RAIN = 30;
const CANNON = 24;

/**
 * A confetti piece. Rain pieces fall from the top with a sway; cannon pieces
 * are shot up from a bottom corner and fall back under gravity.
 */
type Piece = {
  kind: 'rain' | 'cannon';
  x: number;
  delay: number;
  dur: number;
  size: number;
  spin: number;
  sway: number;
  /** Cannon: horizontal travel and launch height, in px. */
  vx: number;
  vy: number;
  tone: 0 | 1 | 2 | 3;
  round: boolean;
};

/** Ink, paper, silver and smoke: strictly on brand, still a celebration. */
const TONES = ['#FFFFFF', '#0B0B0C', '#C9CCD1', '#6E7178'] as const;

/**
 * One-shot effects drawn over the screen when a game ends. Touches pass
 * through, so the result card underneath stays usable.
 * - Every result: a frosted glass plaque with the result crest, how the game
 *   ended in engraved small caps, one word ("Victory", "Defeat", "Draw") and
 *   the score between hairlines. It clears before the result card arrives.
 * - Win: monochrome confetti fires from the bottom corners and rains from the top.
 * - Loss: a soft, calm dim behind the plaque that lifts with it.
 * Respects the system "reduce motion" setting.
 */
export function GameEndCelebration({ result, reason, score, seed, width, height }: { result: EndResult; reason: string; score: string; seed: string; width: number; height: number }) {
  const reduced = useReducedMotion();
  const pieces = useMemo<Piece[]>(() => {
    const r = seeded(seed);
    const rain = Array.from({ length: RAIN }, (): Piece => ({
      kind: 'rain',
      x: r() * width,
      delay: 350 + r() * 900,
      dur: 2000 + r() * 1500,
      size: 6 + r() * 7,
      spin: (r() < 0.5 ? -1 : 1) * (360 + r() * 540),
      sway: 12 + r() * 26,
      vx: 0,
      vy: 0,
      tone: Math.floor(r() * 4) as Piece['tone'],
      round: r() < 0.25,
    }));
    const cannon = Array.from({ length: CANNON }, (_, i): Piece => {
      const left = i % 2 === 0;
      return {
        kind: 'cannon',
        x: left ? 0 : width,
        delay: r() * 160,
        dur: 1400 + r() * 700,
        size: 7 + r() * 6,
        spin: (r() < 0.5 ? -1 : 1) * (540 + r() * 720),
        sway: 0,
        vx: (left ? 1 : -1) * width * (0.25 + r() * 0.5),
        vy: height * (0.55 + r() * 0.4),
        tone: Math.floor(r() * 4) as Piece['tone'],
        round: r() < 0.3,
      };
    });
    return [...cannon, ...rain];
  }, [seed, width, height]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {result === 'loss' && <CalmDim />}
      {result === 'win' && !reduced && pieces.map((p, i) => <Confetto key={i} p={p} height={height} />)}
      <ResultStamp result={result} reason={reason} score={score} reduced={reduced} />
    </View>
  );
}

function Confetto({ p, height }: { p: Piece; height: number }) {
  const c = useColors();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(p.delay, withTiming(1, { duration: p.dur, easing: p.kind === 'cannon' ? Easing.linear : Easing.in(Easing.quad) }));
  }, [p, v]);
  const style = useAnimatedStyle(() => {
    const t = v.value;
    // Cannon: up fast, then gravity brings it back down (a parabola peaking at ~40% of the flight).
    const x = p.kind === 'cannon' ? p.x + p.vx * t : p.x + Math.sin(t * Math.PI * 3) * p.sway;
    const y = p.kind === 'cannon' ? height - p.vy * (2.5 * t - 3.1 * t * t) : -24 + t * (height + 48);
    return {
      opacity: t === 0 ? 0 : t > 0.85 ? (1 - t) / 0.15 : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${t * p.spin}deg` }, { rotateX: `${t * p.spin * 0.6}deg` }],
    };
  });
  const fill = TONES[p.tone];
  return (
    <Animated.View
      style={[
        styles.confetto,
        {
          width: p.size,
          height: p.round ? p.size : p.size * 0.45,
          borderRadius: p.round ? p.size / 2 : 1.5,
          backgroundColor: fill,
          borderColor: c.scheme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)',
        },
        style,
      ]}
    />
  );
}

/** A quiet dim behind the stamp after a loss; it lifts again so the result card stays bright. */
function CalmDim() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withSequence(withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }), withDelay(STAMP_MS - 900, withTiming(0, { duration: 500 })));
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value * 0.18 }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]} />;
}

/**
 * The result plaque: frosted glass, crest on top, then "BY CHECKMATE", "Victory" and "1 – 0".
 * In, hold, out on fixed timings so it always clears before the result card arrives.
 */
function ResultStamp({ result, reason, score, reduced }: { result: EndResult; reason: string; score: string; reduced: boolean }) {
  const c = useColors();
  const word = useStampWord(result);
  const opacity = useSharedValue(0);
  const pop = useSharedValue(reduced ? 1 : 0);
  const rule = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    opacity.value = withSequence(withTiming(1, { duration: 220 }), withDelay(STAMP_MS - 220 - 320 - 60, withTiming(0, { duration: 320 })));
    if (reduced) return;
    pop.value = withSpring(1, { damping: 16, stiffness: 180 });
    rule.value = withDelay(180, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [reduced, opacity, pop, rule]);
  const box = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: 0.92 + 0.08 * pop.value }, { translateY: (1 - pop.value) * 10 }] }));
  const lines = useAnimatedStyle(() => ({ transform: [{ scaleX: rule.value }] }));
  const [l, r] = scoreParts(score);
  return (
    <View style={styles.center}>
      <Animated.View style={box}>
        <GlassView strength="strong" radius="xl" elevation="lg" style={styles.plaque}>
          {/* Frosted, not clear: the board must not fight the headline. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceSolid, opacity: 0.72 }]} />
          <ResultCrest result={result} reason={reason} size={92} glint delay={260} />
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Eyebrow align="center">{reasonText(reason)}</Eyebrow>
            <Text variant="display" align="center" style={{ fontSize: 40, lineHeight: 48, letterSpacing: -0.5 }}>
              {word}
            </Text>
          </View>
          <View style={styles.scoreRow}>
            <Animated.View style={[styles.rule, { backgroundColor: c.border, transformOrigin: 'right' }, lines]} />
            <Text variant="figure" style={{ fontSize: 20, lineHeight: 24 }}>
              {l}
              <Text variant="figure" tone="muted" style={{ fontSize: 20, lineHeight: 24 }}>
                {' – '}
              </Text>
              {r}
            </Text>
            <Animated.View style={[styles.rule, { backgroundColor: c.border, transformOrigin: 'left' }, lines]} />
          </View>
        </GlassView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  confetto: { position: 'absolute', top: 0, left: 0, borderWidth: StyleSheet.hairlineWidth },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  plaque: { minWidth: 260, paddingHorizontal: 32, paddingTop: 28, paddingBottom: 22, alignItems: 'center', gap: 14 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
