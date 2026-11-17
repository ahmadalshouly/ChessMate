import type { MoveClass } from '@chessmate/core';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { MOVE_CLASS } from '@/constants/analysis';
import { Text } from '@/ui/primitives';

/** Shifts a #RRGGBB colour lighter (amount > 0) or darker (amount < 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `#${((1 << 24) | (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1)}`;
}

export interface MoveBadgeProps {
  cls: MoveClass;
  /** Diameter in px. Under 40 the coin shows the icon only. */
  size?: number;
  /** Show the class name under the coin. */
  label?: boolean;
  /** White sticker rim, for badges drawn on top of the board. */
  rim?: boolean;
}

/**
 * Move classification badge, styled as a minted coin: metallic gradient in the class
 * colour, an inner ring, an embossed icon and the annotation symbol (!!, ?, ...).
 */
export function MoveBadge({ cls, size = 56, label, rim }: MoveBadgeProps) {
  const c = MOVE_CLASS[cls];
  const big = size >= 40;
  const ink = 'rgba(255, 255, 255, 0.94)';
  const engrave = { textShadowColor: shade(c.color, -0.45), textShadowOffset: { width: 0, height: Math.max(0.5, size / 64) }, textShadowRadius: 0.5 };
  return (
    <View style={{ alignItems: 'center', gap: 6 }} accessibilityRole="image" accessibilityLabel={c.label}>
      <View
        style={[
          styles.coin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: rim ? Math.max(1.5, size * 0.06) : StyleSheet.hairlineWidth * 2,
            borderColor: rim ? '#FFFFFF' : shade(c.color, -0.35),
            shadowRadius: size * 0.12,
            shadowOffset: { width: 0, height: size * 0.05 },
          },
        ]}>
        <LinearGradient colors={[shade(c.color, 0.32), c.color, shade(c.color, -0.28)]} locations={[0, 0.5, 1]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* Sheen across the top half of the coin. */}
        <LinearGradient colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }} style={StyleSheet.absoluteFill} />
        {big && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: size * 0.07,
              left: size * 0.07,
              right: size * 0.07,
              bottom: size * 0.07,
              borderRadius: size,
              borderWidth: Math.max(1, size * 0.025),
              borderTopColor: shade(c.color, -0.3),
              borderLeftColor: shade(c.color, -0.2),
              borderRightColor: shade(c.color, 0.25),
              borderBottomColor: shade(c.color, 0.35),
            }}
          />
        )}
        <MaterialCommunityIcons name={c.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={size * (big ? (c.symbol ? 0.36 : 0.48) : 0.62)} color={ink} style={engrave} />
        {big && !!c.symbol && <Text style={[styles.symbol, engrave, { color: ink, fontSize: size * 0.2, lineHeight: size * 0.22 }]}>{c.symbol}</Text>}
      </View>
      {label && (
        <Text style={[styles.label, { color: c.color }]} numberOfLines={1}>
          {c.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  coin: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.28, elevation: 3 },
  symbol: { fontWeight: '800', letterSpacing: 0.5, marginTop: -1 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
});
