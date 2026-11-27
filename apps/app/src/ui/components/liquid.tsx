import { BlurView } from 'expo-blur';
import { GlassView as NativeGlass, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View, type PressableProps, type PressableStateCallbackType, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useAppTheme } from '../theme/ThemeProvider';
import type { ColorTokens } from '../theme/tokens';

/**
 * Liquid Glass building blocks shared by every glass surface.
 *
 * - On iOS 26+ every glass surface (cards, tab bar, header capsules, glass buttons, sheets) uses
 *   Apple's own Liquid Glass material through `expo-glass-effect`, so it refracts, reacts to
 *   touch and follows the system's accessibility settings exactly like native apps.
 * - Everywhere else (older iOS, Android, web) it is drawn by hand:
 *   backdrop blur with extra saturation, a thin tint, a specular rim that catches light at the
 *   top edge and bounces softly off the bottom, and a sheen across the top.
 */

function detectNativeGlass() {
  if (Platform.OS !== 'ios') return false;
  try {
    // Some iOS 26 betas report Liquid Glass but lack the runtime API and crash: check both.
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/** True when this device renders Apple's native Liquid Glass (iOS 26 and later). */
export const nativeLiquidGlass = detectNativeGlass();

/** Follows the system "Reduce transparency" setting: glass turns into a solid, legible fill. */
export function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduce);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/** Browsers blur and brighten what is behind the element natively (CSS backdrop-filter). */
export function webBackdrop(intensity: number): ViewStyle {
  if (Platform.OS !== 'web') return {};
  const px = Math.round(intensity / 2.2);
  const f = `blur(${px}px) saturate(185%)`;
  return { backdropFilter: f, WebkitBackdropFilter: f } as unknown as ViewStyle;
}

/**
 * Specular rim: inset highlights along the inside of the edge. Bright across the top where
 * light lands, softer at the bottom where it bounces back through the glass. Replaces the
 * heavy outline that frosted panels usually lean on.
 */
export function rimShadow(c: ColorTokens, weight: 'soft' | 'bright' = 'soft'): ViewStyle {
  const top = c.glassRimTop;
  const bottom = c.glassRimBottom;
  const edge = c.scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.35)';
  const k = weight === 'bright' ? 1.5 : 1;
  return {
    boxShadow: `inset 0 ${k}px 0 0 ${top}, inset 0 -${k}px 0 0 ${bottom}, inset 0 0 0 ${StyleSheet.hairlineWidth}px ${edge}`,
  } as ViewStyle;
}

export type LiquidLayerKind = 'panel' | 'chrome' | 'control';

export interface LiquidLayersProps {
  kind: LiquidLayerKind;
  radius: number;
  /** Blur intensity (BlurView units). */
  intensity: number;
  /** Tint over the blur. */
  fill: string;
  /** Turn blur off (long lists, nested glass) and keep the tint, rim and sheen. */
  flat?: boolean;
  /** Draw the top sheen. */
  sheen?: boolean;
  /** Native glass reacts to touch (buttons, tab bar). */
  interactive?: boolean;
}

/**
 * The stack of layers behind a glass surface's content. Put it first inside a view with
 * `overflow: 'hidden'` and the surface's border radius.
 */
export function LiquidLayers({ kind, radius, intensity, fill, flat, sheen = true, interactive }: LiquidLayersProps) {
  const c = useAppTheme().colors;
  const dark = c.scheme === 'dark';
  const reduce = useReduceTransparency();
  const onScreen = useOnScreen();

  if (reduce) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceSolid, borderRadius: radius }, rimShadow(c)]} />;
  }

  // iPhone: content panels (cards) draw as a tint, rim and sheen without a live blur, the way
  // Android always has. Every live glass or blur view re-samples what is behind it each time
  // anything on screen changes; a page holds a dozen cards, and running one per card kept the
  // GPU busy and the phone hot while the app simply sat open. The backdrop behind cards is a soft
  // gradient, so the blur barely showed there. Chrome (header, tab bar, menus, sheets, controls)
  // floats over moving content and keeps the real material.
  const plain = flat || (Platform.OS === 'ios' && kind === 'panel');

  // iOS 26: chrome and controls are Apple's native Liquid Glass, so they refract and light up
  // like the system's own. The board never sits on glass.
  // Only on the screen in front. A native glass view that is not in the window (a tab in the
  // background, the screen under a pushed one) runs a display-link timer at the screen's refresh
  // rate (120 times a second on ProMotion iPhones) until it is shown again: expo-glass-effect
  // waits that way for the view to become visible. Every glass button and header on every
  // screen left behind kept one going, on every screen of the app.
  if (nativeLiquidGlass && !plain && onScreen) {
    return (
      <NativeGlass
        pointerEvents="none"
        glassEffectStyle="regular"
        isInteractive={interactive}
        // Panels hold text: a whisper of tint keeps it legible over busy content behind.
        tintColor={kind === 'panel' ? (dark ? 'rgba(20,20,24,0.25)' : 'rgba(255,255,255,0.2)') : undefined}
        colorScheme={dark ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
    );
  }

  const sheenColors = dark ? (['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] as const) : (['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)'] as const);
  return (
    <>
      {!plain && Platform.OS === 'ios' && <BlurView intensity={intensity} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      {!flat && Platform.OS === 'web' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, webBackdrop(intensity)]} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {sheen && <LinearGradient pointerEvents="none" colors={sheenColors} locations={[0, 1]} style={[styles.sheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }, rimShadow(c, kind === 'panel' ? 'soft' : 'bright')]} />
    </>
  );
}

/**
 * Whether the screen this sits on is the one in front. True outside any screen (root overlays).
 * useIsFocused throws without a navigator around it, which is the only reason for the catch.
 */
function useOnScreen(): boolean {
  try {
    return useIsFocused();
  } catch {
    return true;
  }
}

/**
 * A Pressable whose content squishes under the finger and springs back, the way Liquid Glass
 * controls respond to touch. Runs on the UI thread (Reanimated).
 */
export function PressableScale({
  style,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { scaleTo?: number }) {
  const t = useAppTheme();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        s.set(withSpring(scaleTo, t.motion.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, t.motion.press));
        onPressOut?.(e);
      }}
      style={typeof style === 'function' ? (state: PressableStateCallbackType) => [style(state), anim] : [style, anim]}
    />
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%' },
});
