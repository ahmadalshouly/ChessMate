import type { RatingPoint } from '@chessmate/core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/constants/theme';

const HEIGHT = 160;
const PAD = { top: 12, bottom: 18, left: 40, right: 8 };

/**
 * Line chart drawn with plain Views (rotated segments), so it needs no
 * charting or SVG dependency and renders the same on iOS, Android and web.
 */
export function RatingGraph({ points }: { points: RatingPoint[] }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { borderColor: t.border }]}>
        <Text style={{ color: t.muted }}>{points.length === 0 ? 'No rated games in this time control yet.' : 'Play one more rated game to see your graph.'}</Text>
      </View>
    );
  }

  const ratings = points.map((p) => p.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const step = 50;
  const min = Math.floor((rawMin - 10) / step) * step;
  const max = Math.max(Math.ceil((rawMax + 10) / step) * step, min + step);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const y = (r: number) => PAD.top + (1 - (r - min) / (max - min)) * plotH;
  const ticks = [max, Math.round((max + min) / 2), min];
  const sel = active === null ? points.length - 1 : active;
  const selPoint = points[sel]!;

  const pickAt = (px: number) => {
    if (plotW <= 0) return;
    const i = Math.round(((px - PAD.left) / plotW) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <View>
      <View style={styles.readout}>
        <Text style={[styles.readoutValue, { color: t.text }]}>{Math.round(selPoint.rating)}</Text>
        <Text style={{ color: t.muted }}>{new Date(selPoint.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
      </View>
      <Pressable
        onLayout={onLayout}
        onPressIn={(e) => pickAt(e.nativeEvent.locationX)}
        onPressOut={() => setActive(null)}
        accessibilityLabel={`Rating graph from ${Math.round(points[0]!.rating)} to ${Math.round(points[points.length - 1]!.rating)}`}
        style={{ height: HEIGHT }}>
        {ticks.map((r) => (
          <View key={r} pointerEvents="none" style={[styles.grid, { top: y(r), left: PAD.left, right: PAD.right, backgroundColor: t.border }]}>
            <Text style={[styles.tick, { color: t.muted }]}>{r}</Text>
          </View>
        ))}
        {width > 0 &&
          points.slice(1).map((p, i) => {
            const x1 = x(i);
            const y1 = y(points[i]!.rating);
            const x2 = x(i + 1);
            const y2 = y(p.rating);
            const len = Math.hypot(x2 - x1, y2 - y1);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            return (
              <View
                key={p.gameId}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: (x1 + x2) / 2 - len / 2,
                  top: (y1 + y2) / 2 - 1,
                  width: len,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: t.text,
                  transform: [{ rotate: `${angle}rad` }],
                }}
              />
            );
          })}
        {width > 0 && (
          <View
            pointerEvents="none"
            style={[styles.dot, { left: x(sel) - 5, top: y(selPoint.rating) - 5, backgroundColor: t.text, borderColor: t.surfaceSolid }]}
          />
        )}
        <Text style={[styles.axis, { left: PAD.left, color: t.muted }]}>{shortDate(points[0]!.t)}</Text>
        <Text style={[styles.axis, { right: PAD.right, color: t.muted }]}>{shortDate(points[points.length - 1]!.t)}</Text>
      </Pressable>
    </View>
  );
}

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const styles = StyleSheet.create({
  empty: { height: 100, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 12 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  readoutValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  grid: { position: 'absolute', height: StyleSheet.hairlineWidth },
  tick: { position: 'absolute', left: -PAD.left, width: PAD.left - 6, top: -7, fontSize: 11, textAlign: 'right', fontVariant: ['tabular-nums'] },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  axis: { position: 'absolute', bottom: 0, fontSize: 11 },
});
