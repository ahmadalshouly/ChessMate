import type { Color, MoveClass, Square } from '@chessmate/core';
import { useEffect, useId, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { PLACE_ORIGIN } from '@/components/boardLayout';
import { MOVE_CLASS, type BadgeIcon } from '@/constants/analysis';

/**
 * Move classification medallions: embossed metal coins, one colour per class,
 * with the class name around the top, an icon in the middle and the
 * annotation symbol (!!, ??) below it. Drawn as SVG so they stay sharp at
 * every size and look the same on iOS, Android and web.
 *
 * - `variant="full"`: the whole medallion, for review lists and summaries.
 * - `variant="mini"`: a small coin with only the symbol (or the icon when the
 *   class has no symbol), white-edged so it reads on any board theme.
 */
export function MoveBadge({ cls, size = 24, variant = 'mini' }: { cls: MoveClass; size?: number; variant?: 'full' | 'mini' }) {
  const c = MOVE_CLASS[cls];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const face = `face${id}`;
  const rimGrad = `rim${id}`;
  const ink = shade(c.color, -0.42);
  const relief = shade(c.color, 0.32);
  const full = variant === 'full';
  // On the board a symbol reads better than an icon; the Masterpiece keeps its crown.
  const miniUsesSymbol = !full && !!c.glyph && cls !== 'masterpiece';

  return (
    <View accessibilityRole="image" accessibilityLabel={c.label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={face} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
            <Stop offset="0" stopColor={shade(c.color, 0.22)} />
            <Stop offset="0.55" stopColor={c.color} />
            <Stop offset="1" stopColor={shade(c.color, -0.22)} />
          </LinearGradient>
          <LinearGradient id={rimGrad} x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={shade(c.color, 0.1)} />
            <Stop offset="1" stopColor={shade(c.color, -0.4)} />
          </LinearGradient>
        </Defs>

        {/* White edge so the coin separates from any square colour. */}
        {!full && <Circle cx="50" cy="50" r="49" fill="#FFFFFF" />}
        {/* Drop shadow, rim and face. */}
        <Circle cx="50.8" cy="52" r={full ? 47 : 45} fill="rgba(0,0,0,0.28)" />
        <Circle cx="50" cy="50" r={full ? 47 : 45} fill={`url(#${rimGrad})`} />
        <Circle cx="50" cy="50" r={full ? 43.5 : 41.5} fill={`url(#${face})`} />
        {/* Raised inner ring: light on top, dark underneath. */}
        <Circle cx="50" cy="50" r={full ? 41.5 : 39.5} fill="none" stroke={shade(c.color, -0.3)} strokeWidth="1.2" opacity={0.7} />
        <Circle cx="50" cy="49.4" r={full ? 41.5 : 39.5} fill="none" stroke={shade(c.color, 0.4)} strokeWidth="0.8" opacity={0.6} />
        {/* Soft sheen across the top. */}
        <Ellipse cx="50" cy="24" rx="26" ry="10" fill="#FFFFFF" opacity={0.07} />

        {full && (
          <>
            <Embossed ink={relief} relief={ink} depth={-0.9}>
              {(fill) => <ArcLabel text={c.label.toUpperCase()} fill={fill} />}
            </Embossed>
            <G transform={c.glyph ? 'translate(50 50) scale(0.74)' : 'translate(50 56) scale(0.88)'}>
              <Embossed ink={shade(c.color, -0.45)} relief={shade(c.color, 0.4)} depth={1.8}>
                {(fill) => <Icon name={c.icon} fill={fill} />}
              </Embossed>
            </G>
            {c.glyph && (
              <Embossed ink={shade(c.color, -0.45)} relief={shade(c.color, 0.5)} depth={1.4}>
                {(fill) => (
                  <SvgText x="50" y="87" fill={fill} fontSize={c.glyph!.length > 2 ? 17 : 19} fontWeight="700" fontFamily="Montserrat_700Bold" textAnchor="middle">
                    {c.glyph}
                  </SvgText>
                )}
              </Embossed>
            )}
          </>
        )}

        {!full && miniUsesSymbol && (
          <SvgText
            x="50"
            y={c.glyph!.length > 1 ? 65 : 68}
            fill="#FFFFFF"
            stroke={shade(c.color, -0.45)}
            strokeWidth="1.2"
            fontSize={c.glyph!.length > 2 ? 34 : c.glyph!.length > 1 ? 44 : 52}
            fontWeight="700"
            fontFamily="Montserrat_700Bold"
            letterSpacing={c.glyph!.length > 1 ? -2 : 0}
            textAnchor="middle">
            {c.glyph}
          </SvgText>
        )}
        {!full && !miniUsesSymbol && (
          <G transform="translate(50 50) scale(1.05)">
            <Embossed ink={shade(c.color, -0.45)} relief="#FFFFFF" depth={1.4}>
              {(fill) => <Icon name={c.icon} fill={fill} />}
            </Embossed>
          </G>
        )}
      </Svg>
    </View>
  );
}

/** Draws its child twice: a dark copy offset down for depth, then the face in a light tone. */
function Embossed({ ink, relief, depth = 1, children }: { ink: string; relief: string; depth?: number; children: (fill: string) => React.ReactNode }) {
  return (
    <>
      <G transform={`translate(${depth * 0.5} ${depth})`} opacity={0.75}>
        {children(ink)}
      </G>
      <G>{children(relief)}</G>
    </>
  );
}

/** Approximate advance widths of Montserrat Bold capitals, in ems. */
const CAP_WIDTH: Record<string, number> = {
  ' ': 0.3, I: 0.3, J: 0.55, L: 0.58, E: 0.64, F: 0.62, T: 0.62, S: 0.64, Z: 0.66, Y: 0.7, K: 0.72, B: 0.74, P: 0.72, R: 0.73,
  X: 0.72, V: 0.74, A: 0.77, U: 0.77, N: 0.8, H: 0.8, D: 0.8, O: 0.82, C: 0.76, G: 0.8, Q: 0.82, M: 0.92, W: 1.0,
};

/**
 * The class name set around the top of the coin, one letter at a time so it
 * is centred the same way on every platform (SVG textPath is not).
 */
function ArcLabel({ text, fill }: { text: string; fill: string }) {
  const r = 30;
  const spacing = 0.06;
  const widths = [...text].map((ch) => CAP_WIDTH[ch] ?? 0.72);
  const em = widths.reduce((a, w) => a + w + spacing, -spacing);
  // Fit within about 200 degrees of arc.
  const fontSize = Math.min(11.5, (r * 3.6) / em);
  const total = (em * fontSize) / r;
  let angle = -Math.PI / 2 - total / 2;
  return (
    <>
      {[...text].map((ch, i) => {
        const w = (widths[i]! * fontSize) / r;
        const mid = angle + w / 2;
        angle += w + (spacing * fontSize) / r;
        if (ch === ' ') return null;
        const x = 50 + r * Math.cos(mid);
        const y = 50 + r * Math.sin(mid);
        const deg = (mid * 180) / Math.PI + 90;
        return (
          <SvgText
            key={i}
            x={x}
            y={y}
            fill={fill}
            fontSize={fontSize}
            fontWeight="700"
            fontFamily="Montserrat_700Bold"
            textAnchor="middle"
            transform={`rotate(${deg.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`}>
            {ch}
          </SvgText>
        );
      })}
    </>
  );
}

/** Four-pointed sparkle centred on (x, y). */
function sparkle(x: number, y: number, s: number) {
  return `M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`;
}

function starPoints(r: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Class icons, drawn in a 40 x 40 box centred on the origin. */
function Icon({ name, fill }: { name: BadgeIcon; fill: string }) {
  const line = { stroke: fill, strokeWidth: 6.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'star':
      return <Polygon points={starPoints(20, 8.5)} fill={fill} />;
    case 'sparkles':
      return (
        <>
          <Path d={sparkle(5, -6, 13)} fill={fill} />
          <Path d={sparkle(-12, 8, 7.5)} fill={fill} />
          <Path d={sparkle(13, 13, 6.5)} fill={fill} />
        </>
      );
    case 'check':
      return <Path d="M -15 1 L -4 12 L 16 -11" {...line} />;
    case 'trend-check':
      return (
        <>
          <Path d="M -17 4 L -8 13 L 10 -6" {...line} />
          <Polygon points="18,-15 3,-11 14,1" fill={fill} />
        </>
      );
    case 'book':
      return (
        <>
          <Path d="M -1.5 -9 C -7 -14 -13 -14 -19 -12 L -19 12 C -13 10 -7 10 -1.5 14 Z" fill={fill} />
          <Path d="M 1.5 -9 C 7 -14 13 -14 19 -12 L 19 12 C 13 10 7 10 1.5 14 Z" fill={fill} />
        </>
      );
    case 'crown':
      return (
        <>
          <Path d="M -16 9 L -18 -9 L -8 0 L 0 -14 L 8 0 L 18 -9 L 16 9 Z" fill={fill} />
          <Circle cx="-18" cy="-11" r="3.4" fill={fill} />
          <Circle cx="0" cy="-16" r="3.4" fill={fill} />
          <Circle cx="18" cy="-11" r="3.4" fill={fill} />
          <Rect x="-16" y="12" width="32" height="4.5" rx="1.5" fill={fill} />
        </>
      );
    case 'bolt':
      return <Polygon points="5,-20 -12,3 -1,3 -5,20 13,-5 2,-5 8,-20" fill={fill} />;
    case 'cross':
      return (
        <>
          <Path d="M -13 -13 L 13 13" {...line} strokeWidth={7.5} />
          <Path d="M 13 -13 L -13 13" {...line} strokeWidth={7.5} />
        </>
      );
    case 'crossed-arrows':
      return (
        <>
          <Path d="M -15 -15 L 9 9" {...line} strokeWidth={4.5} />
          <Polygon points="16,16 3,14 14,3" fill={fill} />
          <Path d="M -15 15 C -7 13 2 6 6 -7" {...line} strokeWidth={4.5} />
          <Polygon points="9,-17 0,-6 13,-4" fill={fill} />
        </>
      );
    case 'target':
      return (
        <>
          <Circle cx="0" cy="0" r="15" fill="none" stroke={fill} strokeWidth="4.5" />
          <Circle cx="0" cy="0" r="7.5" fill="none" stroke={fill} strokeWidth="4" />
          <Circle cx="0" cy="0" r="2.6" fill={fill} />
        </>
      );
    case 'trend-down':
      return (
        <>
          <Path d="M -18 -10 L -7 0 L 0 -6 L 11 6" {...line} strokeWidth={5} />
          <Polygon points="18,13 4,11 15,0" fill={fill} />
        </>
      );
    case 'arrow':
      return (
        <>
          <Path d="M -16 0 L 8 0" {...line} />
          <Polygon points="18,0 4,-11 4,11" fill={fill} />
        </>
      );
  }
}

/** Lightens (amount > 0) or darkens (amount < 0) a #RRGGBB colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function squareBox(sq: Square, orientation: Color, cell: number) {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  const col = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  return { left: col * cell, top: row * cell };
}

/**
 * Puts a small medallion on the top-right corner of the square a piece moved
 * to. Drawn as an overlay above the board (like the engine arrows), so it
 * works with every board theme. Place it in a container the size of the board.
 */
export function BoardMoveBadge({ square, cls, size, orientation }: { square: Square; cls: MoveClass; size: number; orientation: Color }) {
  const cell = size / 8;
  const badge = Math.round(Math.max(20, Math.min(38, cell * 0.52)));
  const box = squareBox(square, orientation, cell);
  // Hang the badge over the corner, but keep it inside the board.
  const left = Math.min(size - badge, box.left + cell - badge * 0.7);
  const top = Math.max(0, box.top - badge * 0.3);
  const [scale] = useState(() => new Animated.Value(0));
  useEffect(() => {
    scale.setValue(0.4);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [square, cls, scale]);
  return (
    // Placed from the board's centre with transforms so it never mirrors (see placeAt).
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, PLACE_ORIGIN, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.lift,
          {
            position: 'absolute',
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            transform: [{ translateX: left + badge / 2 - size / 2 }, { translateY: top + badge / 2 - size / 2 }, { scale }],
          },
        ]}>
        <MoveBadge cls={cls} size={badge} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lift: { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 4 },
});
