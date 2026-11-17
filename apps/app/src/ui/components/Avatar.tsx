import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type PresenceStatus = 'online' | 'playing' | 'away' | 'offline';

export interface AvatarProps {
  /** Display name; used for initials and the accessibility label. */
  name: string;
  uri?: string | null;
  /** Diameter in px. Default 40. */
  size?: number;
  status?: PresenceStatus;
  /** Rounded square instead of a circle (clubs, teams). */
  square?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Profile picture with monochrome initials fallback and presence dot. */
export function Avatar({ name, uri, size = 40, status, square, style }: AvatarProps) {
  const c = useAppTheme().colors;
  const radius = square ? size * 0.28 : size / 2;
  const dot = Math.max(8, Math.round(size * 0.26));
  const statusColor = status === 'online' ? c.live : status === 'playing' ? c.warning : status === 'away' ? c.textTertiary : c.borderStrong;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={status ? `${name}, ${status}` : name}
      style={[{ width: size, height: size }, style]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, overflow: 'hidden', backgroundColor: c.surfaceSunken, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.glassBorder },
          styles.center,
        ]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={{ fontSize: size * 0.38, lineHeight: size * 0.46, fontWeight: '700' }}>{initials(name)}</Text>
        )}
      </View>
      {status && (
        <View
          style={{
            position: 'absolute',
            right: square ? -2 : 0,
            bottom: square ? -2 : 0,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: statusColor,
            borderWidth: 2,
            borderColor: c.surfaceSolid,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
