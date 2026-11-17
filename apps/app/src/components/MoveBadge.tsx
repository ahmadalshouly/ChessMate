import type { Color, MoveClass, Square } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { MOVE_CLASS } from '@/constants/analysis';
import { Text } from '@/ui/primitives';

/**
 * A move classification badge: a small glass disc in the class colour with a
 * white rim and a soft highlight, so it reads on any board theme. The queen
 * brilliancy (!!!) is a black glass disc with a bright double rim and a crown.
 */
export function MoveBadge({ cls, size = 24 }: { cls: MoveClass; size?: number }) {
  const c = MOVE_CLASS[cls];
  const royal = cls === 'royal';
  const rim = Math.max(1, size * (royal ? 0.09 : 0.07));
  const chars = c.glyph?.length ?? 1;
  // Three-mark glyphs (!!!) get a pill so the marks stay readable at small sizes.
  const width = chars > 2 ? size * 1.5 : size;
  const glyphSize = size * (chars > 1 ? 0.52 : 0.62);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={c.label}
      style={[
        styles.disc,
        {
          width,
          height: size,
          borderRadius: size / 2,
          borderWidth: rim,
          backgroundColor: c.color,
          shadowRadius: size * 0.18,
          shadowColor: royal ? '#FFFFFF' : '#000000',
          shadowOpacity: royal ? 0.55 : 0.35,
        },
      ]}>
      {royal && <LinearGradient colors={['#3A3A42', '#0B0B0E', '#000000']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />}
      {/* Glass highlight across the top half. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        locations={[0, 0.5, 0.55]}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      {royal && <View style={[styles.innerRim, { borderRadius: size / 2, margin: rim * 0.6 }]} />}
      {c.glyph ? (
        <Text
          allowFontScaling={false}
          style={[styles.glyph, { fontSize: glyphSize, lineHeight: glyphSize * 1.15, letterSpacing: chars > 1 ? -size * 0.02 : 0 }]}>
          {c.glyph}
        </Text>
      ) : (
        <Ionicons name={c.icon!} size={size * 0.56} color="#FFFFFF" />
      )}
      {royal && size >= 18 && (
        <View pointerEvents="none" style={[styles.crown, { top: -size * 0.5 }]}>
          <MaterialCommunityIcons name="crown" size={size * 0.62} color="#FFFFFF" style={styles.crownShadow} />
        </View>
      )}
    </View>
  );
}

function squareBox(sq: Square, orientation: Color, cell: number) {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  const col = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  return { left: col * cell, top: row * cell };
}

/**
 * Puts a move badge on the top-right corner of the square a piece moved to.
 * Drawn as an overlay above the board (like the engine arrows), so it works
 * with every board theme. Place it in a container the size of the board.
 */
export function BoardMoveBadge({ square, cls, size, orientation }: { square: Square; cls: MoveClass; size: number; orientation: Color }) {
  const cell = size / 8;
  const badge = Math.round(Math.max(18, Math.min(36, cell * 0.5)));
  const badgeWidth = cls === 'royal' ? badge * 1.5 : badge;
  const box = squareBox(square, orientation, cell);
  // Hang the badge over the corner, but keep it inside the board.
  const left = Math.min(size - badgeWidth, box.left + cell - badgeWidth * 0.7);
  const top = Math.max(cls === 'royal' ? badge * 0.5 : 0, box.top - badge * 0.3);
  const [scale] = useState(() => new Animated.Value(0));
  useEffect(() => {
    scale.setValue(0.4);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [square, cls, scale]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: size, height: size }]}>
      <Animated.View style={{ position: 'absolute', left, top, transform: [{ scale }] }}>
        <MoveBadge cls={cls} size={badge} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255,255,255,0.94)',
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  innerRim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  glyph: { color: '#FFFFFF', fontWeight: '900', textAlign: 'center', includeFontPadding: false },
  crown: { position: 'absolute', alignSelf: 'center' },
  crownShadow: { textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
});
