import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { useT } from '@/i18n';
import { Text, rimShadow, shadows, useColors } from '@/ui';

/** How long the intro lasts from mount to gone, in ms. */
export const HANDSHAKE_MS = 1500;
const ENTER_MS = 360;
const SHAKE_AT = 400;
const LEAVE_AT = 1200;
const LEAVE_MS = 290;
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

// Black-and-white figures drawn like a photo in monochrome: the white player's arm comes in
// from the left in a light-grey suit, the black player's from the right in a black one. The
// left hand shows its back, fingers wrapped round the other palm; the right hand's thumb lies
// over its knuckles and its fingertips curl round the palm edge, as in a real handshake.
// The view box crops to the clasp; the sleeves run past it and are cut by the board's edge.
const VB_X = 60;
const VB_Y = 40;
const VB_W = 280;
const VB_H = 154;
const VIEW_BOX = `${VB_X} ${VB_Y} ${VB_W} ${VB_H}`;
const LINE = '#7A736B';
const CREASE = '#A69F97';

/** The black player's sleeve, cuff and the heel of the hand, behind the clasp. */
function RightBack() {
  return (
    <Svg width="100%" height="100%" viewBox={VIEW_BOX}>
      <Defs>
        <LinearGradient id="hsSuitR" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A4A51" />
          <Stop offset="0.45" stopColor="#25252A" />
          <Stop offset="1" stopColor="#08080A" />
        </LinearGradient>
        <LinearGradient id="hsCuffR" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.7" stopColor="#E6E6E9" />
          <Stop offset="1" stopColor="#C4C4C8" />
        </LinearGradient>
        <LinearGradient id="hsHeel" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EBE6E0" />
          <Stop offset="0.6" stopColor="#CFC8C0" />
          <Stop offset="1" stopColor="#9F988F" />
        </LinearGradient>
        <RadialGradient id="hsShadow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={204} cy={178} rx={96} ry={10} fill="url(#hsShadow)" />
      <G strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M296 92 C 330 94, 370 98, 420 104 L 420 176 C 370 170, 330 166, 296 164 Z" fill="url(#hsSuitR)" stroke="#060607" />
        <Path d="M314 98 C 324 118, 326 144, 320 165" fill="none" stroke="#5A5A62" strokeWidth={0.7} />
        <Path d="M280 89 C 288 86, 298 87, 304 90 C 306 114, 306 140, 303 165 C 296 168, 286 167, 279 164 C 282 140, 282 114, 280 89 Z" fill="url(#hsCuffR)" stroke="#909095" />
        <Path d="M282 94 C 268 88, 250 88, 236 92 L 228 158 C 244 170, 266 170, 282 160 Z" fill="url(#hsHeel)" stroke={LINE} />
      </G>
    </Svg>
  );
}

/** The white player's arm: sleeve, cuff, the back of the hand and the four fingers wrapped round. */
function LeftArm() {
  const hand =
    'M121 106 C 134 99, 152 92, 172 88 C 188 85, 202 85, 211 89 C 218 102, 220 128, 216 150 C 204 160, 186 162, 168 161 C 152 161, 136 159, 123 155 C 120 140, 119 120, 121 106 Z';
  return (
    <Svg width="100%" height="100%" viewBox={VIEW_BOX}>
      <Defs>
        <LinearGradient id="hsSuitL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E6E7E9" />
          <Stop offset="0.5" stopColor="#C6C8CC" />
          <Stop offset="1" stopColor="#8C8E93" />
        </LinearGradient>
        <LinearGradient id="hsCuffL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.7" stopColor="#E6E6E9" />
          <Stop offset="1" stopColor="#C4C4C8" />
        </LinearGradient>
        <LinearGradient id="hsBack" x1="0" y1="0" x2="0.2" y2="1">
          <Stop offset="0" stopColor="#F6F3EF" />
          <Stop offset="0.45" stopColor="#E4DFD9" />
          <Stop offset="0.85" stopColor="#C3BCB4" />
          <Stop offset="1" stopColor="#A69F97" />
        </LinearGradient>
        <RadialGradient id="hsGloss" cx="0.45" cy="0.3" r="0.5">
          <Stop offset="0" stopColor="#FFF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFF" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="hsFinger" x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor="#F3EFEA" />
          <Stop offset="0.55" stopColor="#DDD7D0" />
          <Stop offset="1" stopColor="#ADA69E" />
        </LinearGradient>
      </Defs>
      <G stroke={LINE} strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round">
        <Path d="M-20 114 C 20 110, 60 104, 104 99 L 106 167 C 60 170, 20 176, -20 182 Z" fill="url(#hsSuitL)" stroke="#5C5D62" />
        <Path d="M82 104 C 90 126, 90 150, 84 169" fill="none" stroke="#A9ABB0" strokeWidth={0.7} />
        <Path d="M98 97 C 106 93, 116 93, 124 96 C 127 118, 128 142, 126 165 C 118 169, 108 169, 100 168 C 101 144, 100 120, 98 97 Z" fill="url(#hsCuffL)" stroke="#909095" />
        <Path d={hand} fill="url(#hsBack)" />
        <Path d={hand} fill="url(#hsGloss)" stroke="none" />
        <Path d="M134 110 C 154 104, 180 98, 205 95" fill="none" stroke="#CDC7C0" strokeWidth={1.3} />
        <Path d="M136 122 C 158 118, 184 113, 207 111" fill="none" stroke="#D2CCC5" strokeWidth={1.2} />
        <Path d="M138 134 C 160 131, 186 128, 208 127" fill="none" stroke="#D4CEC7" strokeWidth={1.1} />
        <Path d="M209 88 C 222 83, 242 84, 256 92 C 266 98, 270 108, 266 116 C 262 118, 258 116, 254 112 C 246 106, 232 103, 220 104 C 216 104, 212 105, 210 106 Z" fill="url(#hsFinger)" />
        <Path d="M211 106 C 228 103, 248 107, 262 117 C 272 125, 275 137, 270 144 C 266 146, 262 144, 259 140 C 250 131, 236 125, 222 123 C 218 122, 214 123, 212 123 Z" fill="url(#hsFinger)" />
        <Path d="M212 123 C 228 122, 246 128, 258 139 C 266 147, 267 157, 262 162 C 258 163, 255 161, 252 157 C 245 149, 234 143, 222 140 L 213 140 Z" fill="url(#hsFinger)" />
        <Path d="M213 140 C 225 140, 238 146, 246 155 C 250 161, 249 167, 244 168 C 240 168, 237 165, 234 162 C 228 157, 220 154, 214 153 Z" fill="url(#hsFinger)" />
        <G fill="none" stroke={CREASE} strokeWidth={0.8}>
          <Path d="M240 89 C 243 94, 243 100, 240 104" />
          <Path d="M246 110 C 249 115, 249 121, 245 125" />
          <Path d="M240 130 C 243 135, 243 141, 239 144" />
          <Path d="M232 148 C 234 152, 234 156, 231 158" />
          <Path d="M262 106 C 266 108, 267 113, 264 116" stroke="#968E86" />
          <Path d="M266 132 C 270 135, 270 140, 267 143" stroke="#968E86" />
          <Path d="M258 151 C 262 154, 262 159, 259 161" stroke="#968E86" />
        </G>
      </G>
    </Svg>
  );
}

/** The black player's thumb over the other hand's knuckles, and fingertips curled round its palm edge. */
function RightFront() {
  const tips = [
    'M146 171 C 143 162, 145 151, 151 146 C 157 142, 164 145, 165 152 C 166 159, 164 166, 162 172 C 157 174, 150 174, 146 171 Z',
    'M165 172 C 163 162, 165 150, 172 145 C 178 141, 185 145, 185 152 C 186 160, 184 167, 182 173 C 177 175, 170 175, 165 172 Z',
    'M185 172 C 184 163, 186 153, 192 149 C 198 146, 204 150, 203 156 C 203 162, 201 167, 199 171 C 195 173, 189 174, 185 172 Z',
  ];
  const nails = [
    'M149 152 C 151 148, 158 147, 161 150 C 160 154, 152 155, 149 152 Z',
    'M168 151 C 170 147, 178 146, 181 149 C 180 153, 171 154, 168 151 Z',
    'M188 155 C 190 151, 197 150, 200 153 C 199 157, 191 158, 188 155 Z',
  ];
  return (
    <Svg width="100%" height="100%" viewBox={VIEW_BOX}>
      <Defs>
        <LinearGradient id="hsTip" x1="0.3" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#BDB6AE" />
          <Stop offset="1" stopColor="#ECE8E3" />
        </LinearGradient>
        <LinearGradient id="hsThumb" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F2EEE9" />
          <Stop offset="0.6" stopColor="#D8D1CA" />
          <Stop offset="1" stopColor="#AEA79F" />
        </LinearGradient>
      </Defs>
      <G stroke={LINE} strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round">
        {tips.map((d) => (
          <Path key={d} d={d} fill="url(#hsTip)" />
        ))}
        {nails.map((d) => (
          <Path key={d} d={d} fill="#F2EEE9" stroke={CREASE} strokeWidth={0.5} />
        ))}
        <G fill="none" stroke={CREASE} strokeWidth={0.6}>
          <Path d="M150 163 C 154 165, 158 165, 163 163" />
          <Path d="M168 164 C 172 166, 177 166, 183 164" />
          <Path d="M188 164 C 192 166, 196 166, 201 164" />
        </G>
        <Path d="M274 106 C 260 100, 238 97, 216 99 C 206 100, 197 99, 195 93 C 194 87, 200 82, 210 82 C 232 80, 258 83, 280 92 Z" fill="url(#hsThumb)" />
        <Path d="M198 89 C 197 85, 201 83.5, 207 84 C 211 85, 212 90, 209 94 C 204 95.5, 199 93.5, 198 89 Z" fill="#F6F3EF" stroke="#9A9189" strokeWidth={0.6} />
        <Path d="M234 87 C 236 90, 236 94, 234 97" fill="none" stroke={CREASE} strokeWidth={0.7} />
      </G>
    </Svg>
  );
}

/**
 * Two hands meet over the board and shake when a game begins, with a glass
 * "Good luck" tag. The arms reach in, grip, and pump three times from the
 * elbows, each pump smaller than the last, then let go. About 1.5 s, drawn
 * over the board only, and touches pass straight through so the first move
 * (or a premove) is never held up. A move made during the intro fades it out
 * at once. When it ends it unmounts, so it costs nothing while the game is played.
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
    // A gentle squeeze as the hands close.
    grip.set(withDelay(ENTER_MS - 60, withSequence(withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220 }))));
    // Three pumps from the elbows, each smaller and a touch slower, then still.
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
  const artW = Math.round(size * 1.15);
  const artH = Math.round((artW * VB_H) / VB_W);
  const reach = size * 0.16;
  const lift = artH * 0.05;

  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6) * (1 - leave.value) }));
  const clasp = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.8) * (1 - leave.value),
    transform: [{ translateY: -shake.value * lift }, { scaleY: 1 - grip.value * 0.015 }, { scale: 1 - leave.value * 0.04 }],
  }));
  // Each forearm turns about its own elbow (off the board's edge), so the clasp rises and falls on an arc.
  const leftArm = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - enter.value) * reach - leave.value * 8 }, { rotate: `${-shake.value * 2.2}deg` }],
  }));
  const rightArm = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - enter.value) * reach + leave.value * 8 }, { rotate: `${shake.value * 2.2}deg` }],
  }));
  const tag = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (enter.value - 0.55) / 0.45));
    return { opacity: k * (1 - leave.value), transform: [{ translateY: (1 - k) * 8 }] };
  });

  const layer = { position: 'absolute' as const, width: artW, height: artH };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]} accessible accessibilityLabel={tr('game.intro.a11y')} accessibilityLiveRegion="polite">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(8,8,10,0.5)' : 'rgba(250,250,248,0.55)' }, veil]} />
      <View style={styles.center}>
        <Animated.View style={[{ width: artW, height: artH }, clasp]}>
          <Animated.View style={[layer, styles.rightElbow, rightArm]}>
            <RightBack />
          </Animated.View>
          <Animated.View style={[layer, styles.leftElbow, leftArm]}>
            <LeftArm />
          </Animated.View>
          <Animated.View style={[layer, styles.rightElbow, rightArm]}>
            <RightFront />
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
  leftElbow: { transformOrigin: '0% 70%' },
  rightElbow: { transformOrigin: '100% 70%' },
});
