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

const RAIN = 46;
const CANNON = 36;

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

/** Ink, paper, silver and a touch of gold: on brand, but it reads as a party. */
const TONES = ['#FFFFFF', '#0B0B0C', '#A8ACB3', '#E2B53E'] as const;

/**
 * One-shot effects drawn over the board when a game ends. Touches pass
 * through, so the result card underneath stays usable.
 * - Win: two confetti cannons fire from the bottom corners while confetti
 *   rains from the top, and a trophy with turning rays says "Victory!"
 *   ("Checkmate!" for a mate) before the result card slides in.
 * - Loss by checkmate: a glass "Checkmate" stamp pops in with a shaking king.
 * - Loss: a soft, calm dim (the comforting words live in the result card).
 * Respects the system "reduce motion" setting.
 */
export function GameEndCelebration({ result, checkmate, seed, width, height }: { result: EndResult; checkmate: boolean; seed: string; width: number; height: number }) {
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
      {result === 'win' && <VictoryBurst checkmate={checkmate} reduced={reduced} />}
      {result !== 'win' && checkmate && <CheckmateStamp reduced={reduced} />}
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

function CalmDim() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value * 0.18 }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]} />;
}

/** Trophy in a glowing disc with turning rays and a big "Victory!", in and out before the result card. */
function VictoryBurst({ checkmate, reduced }: { checkmate: boolean; reduced: boolean }) {
  const c = useColors();
  const tr = useT();
  const opacity = useSharedValue(0);
  const pop = useSharedValue(reduced ? 1 : 0);
  const spin = useSharedValue(0);
  const wiggle = useSharedValue(0);
  useEffect(() => {
    opacity.value = withSequence(withTiming(1, { duration: 180 }), withDelay(1100, withTiming(0, { duration: 300 })));
    if (reduced) return;
    pop.value = withSpring(1, { damping: 9, stiffness: 170 });
    spin.value = withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) });
    wiggle.value = withDelay(220, withSequence(withTiming(-12, { duration: 90 }), withTiming(10, { duration: 110 }), withTiming(-5, { duration: 90 }), withTiming(0, { duration: 90 })));
  }, [reduced, opacity, pop, spin, wiggle]);
  const box = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: 0.5 + 0.5 * pop.value }] }));
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 120}deg` }, { scale: 0.6 + 0.4 * pop.value }] }));
  const trophy = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value}deg` }] }));
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.victory, box]}>
        <View style={styles.burst}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.raysBox, rays]}>
            {Array.from({ length: 12 }, (_, i) => (
              <View key={i} style={[styles.ray, { transform: [{ rotate: `${i * 30}deg` }, { translateY: -46 }] }]} />
            ))}
          </Animated.View>
          <View style={[styles.disc, { backgroundColor: c.surfaceStrong, borderColor: '#E2B53E' }]}>
            <Animated.View style={trophy}>
              <MaterialCommunityIcons name="trophy" size={40} color="#E2B53E" />
            </Animated.View>
          </View>
        </View>
        <View style={[styles.banner, { backgroundColor: c.surfaceStrong, borderColor: c.glassBorder }]}>
          <Text variant="title" style={{ fontSize: 26, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {checkmate ? tr('play.over.checkmate') : tr('play.over.victory')}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
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
  victory: { alignItems: 'center', gap: 10 },
  burst: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  raysBox: { alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 6, height: 26, borderRadius: 3, backgroundColor: 'rgba(226, 181, 62, 0.75)' },
  disc: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E2B53E',
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  banner: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
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
