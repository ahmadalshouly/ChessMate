import { qrMatrix, qrPath } from '@chessmate/core';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/**
 * A QR code drawn with SVG (encoder in @chessmate/core, no extra library).
 * Always dark on white, whatever the theme, so every camera can read it.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const qr = useMemo(() => {
    try {
      return qrPath(qrMatrix(value));
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;
  return (
    <View accessibilityRole="image" style={{ width: size, height: size, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`}>
        <Rect x={0} y={0} width={qr.size} height={qr.size} fill="#fff" />
        <Path d={qr.path} fill="#111" />
      </Svg>
    </View>
  );
}
