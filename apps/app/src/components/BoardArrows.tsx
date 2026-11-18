import type { Color, Square } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Polygon } from 'react-native-svg';

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
 * Engine arrows drawn over the board as SVG. SVG coordinates are never mirrored, so the
 * arrows stay on the right squares in right-to-left languages too.
 * Place it in a container the size of the board, after the board.
 */
export function BoardArrows({ arrows, size, orientation }: { arrows: Arrow[]; size: number; orientation: Color }) {
  const cell = size / 8;
  const thickness = cell * 0.16;
  const headLen = cell * 0.42;
  const headWidth = cell * 0.5;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {arrows.map((a, i) => {
          if (a.from === a.to) return null;
          const s = center(a.from, orientation, cell);
          const e = center(a.to, orientation, cell);
          const dist = Math.hypot(e.x - s.x, e.y - s.y);
          const ux = (e.x - s.x) / dist;
          const uy = (e.y - s.y) / dist;
          // Start a little off the origin square's centre, stop the shaft under the head.
          const startOffset = cell * 0.22;
          const x0 = s.x + ux * startOffset;
          const y0 = s.y + uy * startOffset;
          const bx = e.x - ux * headLen;
          const by = e.y - uy * headLen;
          const nx = -uy * (headWidth / 2);
          const ny = ux * (headWidth / 2);
          return (
            <G key={`${a.from}${a.to}${i}`}>
              {dist - startOffset > headLen && (
                <Line x1={x0} y1={y0} x2={bx + ux} y2={by + uy} stroke={a.color} strokeWidth={thickness} strokeLinecap="round" />
              )}
              <Polygon points={`${e.x},${e.y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={a.color} />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
