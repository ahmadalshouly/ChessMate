import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { useT } from '@/i18n';
import { Text, rimShadow, shadows, useColors } from '@/ui';

/** How long the intro lasts from mount to gone, in ms. */
export const HANDSHAKE_MS = 1500;
const ENTER_MS = 420;
const SHAKE_AT = 380;
const SHAKE_LEG = 110;
const LEAVE_AT = 1150;
const LEAVE_MS = 330;
/** When a move is played during the intro it gets out of the way this fast. */
const CUT_MS = 160;

/** Games that already had their handshake: a reconnect or a remount does not replay it. */
const greeted = new Set<string>();

/**
 * Whether the start-of-game handshake should be on screen. It plays once per
 * game (`key`), only while no move has been made, and never when the system
 * asks for reduced motion. `moves > 0` ends it early.
 */
export function useGameStartHandshake(key: string | null, moves: number) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!key || reduced || moves > 0 || greeted.has(key)) return;
    greeted.add(key);
    setShown(key);
    // Only a new game starts it; a move ends it through `cut`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown((k) => (k === shown ? null : k)), HANDSHAKE_MS);
    return () => clearTimeout(id);
  }, [shown]);
  // True from the very first render, so the screen can hold back the computer's first move.
  const starting = !!key && !reduced && moves === 0 && !greeted.has(key);
  const active = !!key && (shown === key || starting);
  const done = useCallback(() => setShown(null), []);
  return { active, cut: active && moves > 0, done };
}

// Black-and-white figures: the white player's arm comes in from the left in a silver
// sleeve, the black player's from the right in a black one, and they meet in a clasp.
// The view box crops to the clasp; the sleeves run past it and are cut by the board's edge.
const VB_X = 20;
const VB_Y = 10;
const VB_W = 280;
const VB_H = 140;
const INK = '#0C0C0D';
const PAPER = '#FAFAF8';
const SILVER = '#D6D7D3';
const COAL = '#1A1A1E';
const SW = 2.4;
const FINGERS: [number, number][] = [
  [122, 62],
  [116, 73],
  [117, 84],
  [124, 95],
];

/** The white player's arm and palm (under the clasp). */
function LeftArm() {
  return (
    <G strokeLinejoin="round" strokeLinecap="round">
      <G transform="rotate(-9 160 84)">
        <Rect x={-30} y={62} width={128} height={46} rx={8} fill={SILVER} stroke={INK} strokeWidth={SW} />
        <Rect x={90} y={58} width={16} height={54} rx={5} fill={PAPER} stroke={INK} strokeWidth={SW} />
      </G>
      <Path d="M104 64 C 130 58, 172 58, 196 64 C 208 67, 208 98, 196 101 C 172 106, 130 106, 104 102 Z" fill={PAPER} stroke={INK} strokeWidth={SW} />
    </G>
  );
}

/** The black player's arm, the back of the hand and the fingers wrapped around the other palm. */
function RightArm({ rim }: { rim: string }) {
  return (
    <G strokeLinejoin="round" strokeLinecap="round">
      <G transform="rotate(9 160 84)">
        <Rect x={222} y={62} width={128} height={46} rx={8} fill={COAL} stroke={rim} strokeWidth={SW} />
        <Rect x={214} y={58} width={16} height={54} rx={5} fill={PAPER} stroke={INK} strokeWidth={SW} />
      </G>
      <Path d="M216 62 C 196 56, 168 54, 146 58 L 140 104 C 168 110, 198 108, 216 104 Z" fill={PAPER} stroke={INK} strokeWidth={SW} />
      {FINGERS.map(([x, y]) => (
        <Rect key={y} x={x} y={y} width={44} height={11} rx={5.5} fill={PAPER} stroke={INK} strokeWidth={SW * 0.9} />
      ))}
    </G>
  );
}

/** The white player's thumb, resting over the back of the other hand. */
function LeftThumb() {
  return (
    <G strokeLinejoin="round" strokeLinecap="round">
      <Path d="M114 72 C 132 58, 162 50, 182 51 C 192 52, 192 63, 182 64 C 164 65, 142 72, 128 82 Z" fill={PAPER} stroke={INK} strokeWidth={SW} />
      <Path d="M176 54.5 C 179 55, 180 60, 177 61" fill="none" stroke={INK} strokeWidth={1.4} opacity={0.5} />
    </G>
  );
}

/**
 * Two hands meet over the board and shake once when a game begins, with a
 * glass "Good luck" tag. About 1.5 s, drawn over the board only, and touches
 * pass straight through so the first move (or a premove) is never held up.
 * A move made during the intro fades it out at once. When it ends it
 * unmounts, so it costs nothing while the game is played.
 */
export function GameStartHandshake({ size, white, black, cut, onDone }: { size: number; white?: string; black?: string; cut?: boolean; onDone?: () => void }) {
  const tr = useT();
  const c = useColors();
  const dark = c.scheme === 'dark';
  const enter = useSharedValue(0);
  const shake = useSharedValue(0);
  const leave = useSharedValue(0);

  useEffect(() => {
    const out = Easing.out(Easing.cubic);
    enter.set(withTiming(1, { duration: ENTER_MS, easing: out }));
    const leg = { duration: SHAKE_LEG, easing: Easing.inOut(Easing.sin) };
    shake.set(withDelay(SHAKE_AT, withSequence(withTiming(-1, leg), withTiming(1, leg), withTiming(-1, leg), withTiming(0.6, leg), withTiming(0, leg))));
    leave.set(withDelay(LEAVE_AT, withTiming(1, { duration: LEAVE_MS, easing: Easing.in(Easing.quad) })));
  }, [enter, shake, leave]);

  useEffect(() => {
    if (!cut) return;
    leave.set(withTiming(1, { duration: CUT_MS }));
    const id = setTimeout(() => onDone?.(), CUT_MS);
    return () => clearTimeout(id);
  }, [cut, leave, onDone]);

  const artW = Math.round(size * 1.25);
  const artH = Math.round((artW * VB_H) / VB_W);
  const travel = size * 0.62;
  const lift = artH * 0.035;

  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6) * (1 - leave.value) }));
  const clasp = useAnimatedStyle(() => ({
    opacity: 1 - leave.value,
    transform: [{ translateY: shake.value * lift }, { scale: 1 - leave.value * 0.06 }],
  }));
  const fromLeft = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - enter.value) * travel - leave.value * 10 }] }));
  const fromRight = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - enter.value) * travel + leave.value * 10 }] }));
  const tag = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (enter.value - 0.55) / 0.45));
    return { opacity: k * (1 - leave.value), transform: [{ translateY: (1 - k) * 8 }] };
  });

  const layer = { position: 'absolute' as const, width: artW, height: artH };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]} accessible accessibilityLabel={tr('game.intro.a11y')} accessibilityLiveRegion="polite">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(8,8,10,0.46)' : 'rgba(250,250,248,0.5)' }, veil]} />
      <View style={styles.center}>
        <Animated.View style={[{ width: artW, height: artH }, clasp]}>
          <Animated.View style={[layer, fromLeft]}>
            <Svg width={artW} height={artH} viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}>
              <LeftArm />
            </Svg>
          </Animated.View>
          <Animated.View style={[layer, fromRight]}>
            <Svg width={artW} height={artH} viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}>
              <RightArm rim={dark ? 'rgba(255,255,255,0.55)' : INK} />
            </Svg>
          </Animated.View>
          <Animated.View style={[layer, fromLeft]}>
            <Svg width={artW} height={artH} viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}>
              <LeftThumb />
            </Svg>
          </Animated.View>
        </Animated.View>
        <Animated.View style={tag}>
          {/* A glass capsule without a live backdrop blur: the blur under a fading layer flickers on web and costs frames on Android. */}
          <View style={[styles.tag, { backgroundColor: c.surfaceStrong, borderColor: c.glassBorder }, rimShadow(c, 'bright'), shadows(c).float]}>
            <Text variant="heading" style={styles.tagTitle}>
              {tr('game.intro.goodLuck')}
            </Text>
            {white && black ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {tr('game.intro.match', { white, black })}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', borderRadius: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tag: { paddingHorizontal: 22, paddingVertical: 10, alignItems: 'center', gap: 2, maxWidth: 320, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  tagTitle: { fontSize: 18, letterSpacing: 0.2 },
});
