import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { useT } from '@/i18n';
import { Text, rimShadow, shadows, useColors } from '@/ui';

/** How long the intro lasts from mount to gone, in ms. */
export const HANDSHAKE_MS = 2800;
const ENTER_MS = 320;
const SHAKE_AT = 400;
// The clasp holds still for about a second after the last pump, so it can be seen.
const LEAVE_AT = 2400;
const LEAVE_MS = 400;
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

// Two real-looking hands in a handshake (artwork supplied by Ahmad): a black suit sleeve on
// one side, a white shirt sleeve on the other. Transparent, 1200 x 548.
const HANDSHAKE_IMAGE = require('../../../assets/images/handshake.webp');
const IMAGE_RATIO = 548 / 1200;

/**
 * Two hands meet over the board and shake when a game begins, with a glass
 * "Good luck" tag. The handshake comes in, grips, pumps three times (each
 * pump smaller, swinging slightly as if from the elbows), holds, then lets go. About
 * 2.8 s, drawn over the board only, and touches pass straight through so the
 * first move (or a premove) is never held up. A move made during the intro
 * fades it out at once. When it ends it unmounts, so it costs nothing while
 * the game is played.
 */
export function GameStartHandshake({ size, white, black, cut, onDone }: { size: number; white?: string; black?: string; cut?: boolean; onDone?: () => void }) {
  const tr = useT();
  const c = useColors();
  const dark = c.scheme === 'dark';
  const enter = useSharedValue(0);
  const grip = useSharedValue(0);
  const shake = useSharedValue(0);
  const leave = useSharedValue(0);

  useEffect(() => {
    enter.set(withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) }));
    // A firm squeeze as the hands close.
    grip.set(withDelay(ENTER_MS - 80, withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 240 }))));
    // Three pumps, each smaller and a touch slower, then still.
    const leg = (ms: number) => ({ duration: ms, easing: Easing.inOut(Easing.sin) });
    shake.set(
      withDelay(
        SHAKE_AT,
        withSequence(withTiming(1, leg(120)), withTiming(-0.85, leg(160)), withTiming(0.6, leg(150)), withTiming(-0.35, leg(140)), withTiming(0.12, leg(110)), withTiming(0, leg(100))),
      ),
    );
    leave.set(withDelay(LEAVE_AT, withTiming(1, { duration: LEAVE_MS, easing: Easing.in(Easing.quad) })));
  }, [enter, grip, shake, leave]);

  useEffect(() => {
    if (!cut) return;
    leave.set(withTiming(1, { duration: CUT_MS }));
    const id = setTimeout(() => onDone?.(), CUT_MS);
    return () => clearTimeout(id);
  }, [cut, leave, onDone]);

  // Wider than the board, so the sleeves run off its edges.
  const artW = Math.round(size * 1.12);
  const artH = Math.round(artW * IMAGE_RATIO);
  const lift = artH * 0.07;

  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6) * (1 - leave.value) }));
  const clasp = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.6) * (1 - leave.value),
    transform: [
      { translateY: (1 - enter.value) * 14 - shake.value * lift },
      // A slight swing with each pump, as forearms turn at the elbow.
      { rotate: `${-shake.value * 1.6}deg` },
      { scale: 0.94 + enter.value * 0.06 - leave.value * 0.04 },
      { scaleY: 1 - grip.value * 0.02 },
    ],
  }));
  const tag = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (enter.value - 0.55) / 0.45));
    return { opacity: k * (1 - leave.value), transform: [{ translateY: (1 - k) * 8 }] };
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]} accessible accessibilityLabel={tr('game.intro.a11y')} accessibilityLiveRegion="polite">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(8,8,10,0.5)' : 'rgba(250,250,248,0.55)' }, veil]} />
      <View style={styles.center}>
        <Animated.Image source={HANDSHAKE_IMAGE} style={[{ width: artW, height: artH }, clasp]} resizeMode="contain" fadeDuration={0} />
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
