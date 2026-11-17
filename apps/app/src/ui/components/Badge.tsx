import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import type { ColorTokens } from '../theme/tokens';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'solid' | 'outline' | 'success' | 'warning' | 'danger' | 'live';

export interface BadgeProps {
  label: string | number;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function badgeColors(c: ColorTokens, tone: BadgeTone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'solid':
      return { bg: c.accent, fg: c.onAccent, border: 'transparent' };
    case 'outline':
      return { bg: 'transparent', fg: c.text, border: c.borderStrong };
    case 'success':
      return { bg: c.successSoft, fg: c.success, border: 'transparent' };
    case 'warning':
      return { bg: c.warningSoft, fg: c.warning, border: 'transparent' };
    case 'danger':
      return { bg: c.dangerSoft, fg: c.danger, border: 'transparent' };
    case 'live':
      return { bg: c.successSoft, fg: c.live, border: 'transparent' };
    default:
      return { bg: c.surfaceSunken, fg: c.text, border: 'transparent' };
  }
}

/**
 * Small status label: ratings, titles, "Rated", "Live", result chips, unread counts.
 *
 *   <Badge label="1520" />   <Badge tone="live" label="Live" />   <Badge tone="danger" label={3} />
 */
export function Badge({ label, tone = 'neutral', size = 'sm', icon, style }: BadgeProps) {
  const c = useAppTheme().colors;
  const k = badgeColors(c, tone);
  const sm = size === 'sm';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: k.bg, borderColor: k.border, paddingHorizontal: sm ? 7 : 10, height: sm ? 20 : 26, minWidth: sm ? 20 : 26 },
        style,
      ]}>
      {tone === 'live' && <View style={[styles.liveDot, { backgroundColor: c.live }]} />}
      {icon}
      <Text variant={sm ? 'caption' : 'label'} color={k.fg} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </View>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Selectable pill (time controls, filters). Selected = solid, otherwise glass outline. */
export function Chip({ label, selected, onPress, icon, disabled }: ChipProps) {
  const t = useAppTheme();
  const c = t.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.accent : pressed ? c.surfacePressed : c.surface,
          borderColor: selected ? c.accent : c.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}>
      {icon}
      <Text variant="label" color={selected ? c.onAccent : c.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
});
