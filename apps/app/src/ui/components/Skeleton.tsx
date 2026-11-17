import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import type { Radius } from '../theme/tokens';

const useNative = Platform.OS !== 'web';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: Radius | number;
  style?: StyleProp<ViewStyle>;
}

/** Pulsing placeholder while data loads. Match the size of what it stands in for. */
export function Skeleton({ width = '100%', height = 14, radius = 'xs', style }: SkeletonProps) {
  const t = useAppTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const r = typeof radius === 'number' ? radius : t.radii[radius];
  return (
    <View accessibilityLabel="Loading" style={[{ width, height, borderRadius: r, backgroundColor: t.colors.skeleton, overflow: 'hidden' }, style]}>
      <Animated.View style={{ flex: 1, backgroundColor: t.colors.skeletonHighlight, opacity: pulse }} />
    </View>
  );
}

/** Several text lines; the last one is shorter. */
export function SkeletonText({ lines = 3, lineHeight = 12, gap = 8 }: { lines?: number; lineHeight?: number; gap?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}

/** Placeholder shaped like a ListRow with avatar. */
export function SkeletonRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Skeleton width={40} height={40} radius="pill" />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="50%" height={13} />
        <Skeleton width="30%" height={10} />
      </View>
    </View>
  );
}
