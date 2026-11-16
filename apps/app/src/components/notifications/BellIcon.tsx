import { View } from 'react-native';

/** Monochrome bell drawn with views, so it needs no icon font. */
export function BellIcon({ color, size = 20 }: { color: string; size?: number }) {
  const w = size * 0.72;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{ width: size * 0.16, height: size * 0.1, borderRadius: size, backgroundColor: color }} />
      <View
        style={{
          width: w,
          height: size * 0.56,
          borderTopLeftRadius: w / 2,
          borderTopRightRadius: w / 2,
          borderWidth: size * 0.1,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
      <View style={{ width: size * 0.92, height: size * 0.1, borderRadius: size, backgroundColor: color }} />
      <View style={{ width: size * 0.26, height: size * 0.13, borderBottomLeftRadius: size, borderBottomRightRadius: size, backgroundColor: color, marginTop: size * 0.03 }} />
    </View>
  );
}
