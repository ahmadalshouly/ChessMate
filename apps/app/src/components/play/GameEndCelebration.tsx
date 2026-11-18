import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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

import { useT } from '@/i18n';
import { Text, useColors } from '@/ui';

export type EndResult = 'win' | 'loss' | 'draw';

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

const CONFETTI = 42;

type Piece = { x: number; delay: number; dur: number; size: number; spin: number; sway: number; tone: 0 | 1 | 2; round: boolean };

/**
 * One-shot effects drawn over the board when a game ends. Touches pass
 * through, so the result card underneath stays usable.
 * - Checkmate: a glass "Checkmate" stamp pops in with a shaking king, then clears.
 * - Win: monochrome confetti rains down.
 * - Loss: a soft, calm dim (the comforting words live in the result card).
 * Respects the system "reduce motion" setting.
 */
export function GameEndCelebration({ result, checkmate, seed, width, height }: { result: EndResult; checkmate: boolean; seed: string; width: number; height: number }) {
  const reduced = useReducedMotion();
  const pieces = useMemo<Piece[]>(() => {
    const r = seeded(seed);
    return Array.from({ length: CONFETTI }, () => ({
      x: r() * width,
      delay: (checkmate ? 650 : 0) + r() * 700,
      dur: 1900 + r() * 1400,
      size: 6 + r() * 7,
      spin: (r() < 0.5 ? -1 : 1) * (360 + r() * 540),
      sway: 12 + r() * 26,
      tone: Math.floor(r() * 3) as 0 | 1 | 2,
      round: r() < 0.25,
    }));
  }, [seed, width, checkmate]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {result === 'loss' && <CalmDim />}
      {result === 'win' && !reduced && pieces.map((p, i) => <Confetto key={i} p={p} height={height} />)}
      {checkmate && <CheckmateStamp reduced={reduced} />}
    </View>
  );
}

function Confetto({ p, height }: { p: Piece; height: number }) {
  const c = useColors();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(p.delay, withTiming(1, { duration: p.dur, easing: Easing.in(Easing.quad) }));
  }, [p, v]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value === 0 ? 0 : v.value > 0.85 ? (1 - v.value) / 0.15 : 1,
    transform: [
      { translateX: p.x + Math.sin(v.value * Math.PI * 3) * p.sway },
      { translateY: -24 + v.value * (height + 48) },
      { rotate: `${v.value * p.spin}deg` },
      { rotateX: `${v.value * p.spin * 0.6}deg` },
    ],
  }));
  // Brand is black and white: mix ink, paper and silver so pieces read on both themes.
  const fill = p.tone === 0 ? '#FFFFFF' : p.tone === 1 ? '#0B0B0C' : '#A8ACB3';
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

function CalmDim() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value * 0.18 }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]} />;
}

function CheckmateStamp({ reduced }: { reduced: boolean }) {
  const c = useColors();
  const tr = useT();
  const opacity = useSharedValue(0);
  const pop = useSharedValue(reduced ? 1 : 0);
  const shake = useSharedValue(0);
  useEffect(() => {
    // In, hold, out on fixed timings so the stamp always clears before the result card arrives.
    opacity.value = withSequence(withTiming(1, { duration: 200 }), withDelay(1050, withTiming(0, { duration: 320 })));
    if (reduced) return;
    pop.value = withSpring(1, { damping: 12, stiffness: 200 });
    shake.value = withDelay(260, withSequence(withTiming(-10, { duration: 70 }), withTiming(10, { duration: 90 }), withTiming(-6, { duration: 80 }), withTiming(0, { duration: 80 })));
  }, [reduced, opacity, pop, shake]);
  const box = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 1.7 - 0.7 * pop.value }, { rotate: `${(1 - pop.value) * -8}deg` }],
  }));
  const king = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value}deg` }] }));
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.stamp, { backgroundColor: c.surfaceStrong, borderColor: c.glassBorder }, box]}>
        <Animated.View style={king}>
          <MaterialCommunityIcons name="chess-king" size={30} color={c.text} />
        </Animated.View>
        <Text variant="title" style={{ fontSize: 26, letterSpacing: 2, textTransform: 'uppercase' }}>
          {tr('play.over.checkmate')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  confetto: { position: 'absolute', top: 0, left: 0, borderWidth: StyleSheet.hairlineWidth },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
