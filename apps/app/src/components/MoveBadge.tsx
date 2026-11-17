import type { MoveClass } from '@chessmate/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MOVE_CLASS } from '@/constants/analysis';
import { fonts, useAppTheme } from '@/ui';
import { Text } from '@/ui/primitives';

/** Mixes a #RRGGBB colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const ch = (v: number) => Math.round(v + (target - v) * k);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * A move classification "coin": a metallic disc in the class colour with an embossed
 * icon and annotation symbol, set in a light rim like a sticker.
 *
 * - size ≤ 30: the symbol only (move lists, inline with SAN).
 * - size 31-71: icon and symbol.
 * - size ≥ 72: label, icon and symbol, like the full badge artwork.
 */
export function MoveBadge({ cls, size = 24, rim, style }: { cls: MoveClass; size?: number; /** Light sticker rim. Default on from 44px. */ rim?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useAppTheme();
  const meta = MOVE_CLASS[cls];
  const base = meta.color;
  const showRim = rim ?? size >= 44;
  const pad = showRim ? Math.max(2, size * 0.06) : 0;
  const coin = size - pad * 2;
  const emboss = shade(base, 0.42);
  const small = size <= 30;
  const full = size >= 72;
  const iconSize = full ? coin * 0.3 : coin * 0.4;
  const glyphStyle = { textShadowColor: shade(base, -0.45), textShadowOffset: { width: 0, height: Math.max(1, coin * 0.012) }, textShadowRadius: 0.5 };

  const icon =
    meta.icon.set === 'ion' ? (
      <Ionicons name={meta.icon.name} size={iconSize} color={emboss} style={glyphStyle} />
    ) : (
      <MaterialCommunityIcons name={meta.icon.name} size={iconSize} color={emboss} style={glyphStyle} />
    );

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={meta.label}
      style={[
        { width: size, height: size, borderRadius: size / 2, padding: pad },
        showRim && { backgroundColor: t.colors.scheme === 'dark' ? '#2A2A2E' : '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: size * 0.08, shadowOffset: { width: 0, height: size * 0.03 }, elevation: 2 },
        style,
      ]}>
      <LinearGradient
        colors={[shade(base, 0.28), base, shade(base, -0.28)]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.coin, { width: coin, height: coin, borderRadius: coin / 2, borderColor: shade(base, -0.35) }]}>
        {!small && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { margin: coin * 0.07, borderRadius: coin, borderWidth: Math.max(1, coin * 0.018), borderColor: shade(base, -0.22), borderTopColor: shade(base, 0.3), borderLeftColor: shade(base, 0.18) },
            ]}
          />
        )}
        {small ? (
          <Text style={[styles.symbol, { color: '#FFFFFF', fontSize: coin * ((meta.mark ?? meta.symbol).length > 2 ? 0.38 : 0.5), lineHeight: coin * 0.62 }]}>
            {meta.mark ?? meta.symbol}
          </Text>
        ) : (
          <>
            {full && (
              <Text numberOfLines={1} style={[styles.label, { color: emboss, fontSize: coin * Math.min(0.095, 0.85 / meta.label.length), letterSpacing: coin * 0.006, maxWidth: coin * 0.8 }, glyphStyle]}>
                {meta.label.toUpperCase()}
              </Text>
            )}
            {icon}
            {!!meta.symbol && (
              <Text style={[styles.symbol, { color: emboss, fontSize: coin * (full ? 0.16 : 0.22), lineHeight: coin * (full ? 0.2 : 0.26) }, glyphStyle]}>{meta.symbol}</Text>
            )}
          </>
        )}
      </LinearGradient>
    </View>
  );
}

/** Coin plus the class name, for headers and summaries. */
export function MoveBadgeLabel({ cls, size = 22 }: { cls: MoveClass; size?: number }) {
  const meta = MOVE_CLASS[cls];
  const t = useAppTheme();
  return (
    <View style={styles.row}>
      <MoveBadge cls={cls} size={size} />
      <Text style={{ color: t.colors.text, fontFamily: fonts.sansSemiBold, fontSize: 13.5 }}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coin: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', gap: 1 },
  symbol: { fontFamily: fonts.display, letterSpacing: -0.5, textAlign: 'center' },
  label: { fontFamily: fonts.display, textAlign: 'center', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
