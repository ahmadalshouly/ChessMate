import type { Color, Square } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';

export interface Arrow {
  from: Square;
  to: Square;
  color: string;
}

function center(sq: Square, orientation: Color, cell: number) {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  const col = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 8 - rank : rank - 1;
  return { x: (col + 0.5) * cell, y: (row + 0.5) * cell };
}

/**
 * Engine arrows drawn over the board with plain views (no SVG dependency).
 * Place it in a container the size of the board, after the board.
 */
export function BoardArrows({ arrows, size, orientation }: { arrows: Arrow[]; size: number; orientation: Color }) {
  const cell = size / 8;
  const thickness = cell * 0.16;
  const headLen = cell * 0.42;
  const headWidth = cell * 0.5;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: size, height: size, direction: 'ltr' }]}>
      {arrows.map((a, i) => {
        if (a.from === a.to) return null;
        const s = center(a.from, orientation, cell);
        const e = center(a.to, orientation, cell);
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const ux = dx / dist;
        const uy = dy / dist;
        // Start a little off the origin square's centre, stop the shaft at the head.
        const startOffset = cell * 0.22;
        const shaftLen = Math.max(0, dist - startOffset - headLen + 1);
        const midX = s.x + ux * (startOffset + shaftLen / 2);
        const midY = s.y + uy * (startOffset + shaftLen / 2);
        const headX = e.x - ux * (headLen / 2);
        const headY = e.y - uy * (headLen / 2);
        return (
          <View key={`${a.from}${a.to}${i}`} style={StyleSheet.absoluteFill}>
            <View
              style={{
                position: 'absolute',
                left: midX - shaftLen / 2,
                top: midY - thickness / 2,
                width: shaftLen,
                height: thickness,
                borderRadius: thickness / 2,
                backgroundColor: a.color,
                transform: [{ rotate: `${angle}rad` }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: headX - headLen / 2,
                top: headY - headWidth / 2,
                width: 0,
                height: 0,
                borderLeftWidth: headLen,
                borderTopWidth: headWidth / 2,
                borderBottomWidth: headWidth / 2,
                borderLeftColor: a.color,
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
                transform: [{ rotate: `${angle}rad` }],
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
