import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import type { ColorTokens } from '../theme/tokens';
import { PressableScale, rimShadow } from './liquid';
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

/**
 * Selectable pill (time controls, filters, rounds). Selected = solid accent fill, otherwise glass outline.
 *
 * The colors live on an inner View rather than in a `style` callback on the pressable: on iOS and
 * Android the animated pressable does not re-apply a callback style when `selected` changes, so the
 * fill stayed as it was while the label flipped to `onAccent` (dark text on dark glass in dark mode,
 * white on white in light mode) and the selected chip could not be told apart.
 */
export function Chip({ label, selected, onPress, icon, disabled }: ChipProps) {
  const t = useAppTheme();
  const c = t.colors;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.94}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      {({ pressed }) => (
        <View
          style={[
            styles.chip,
            {
              backgroundColor: selected ? c.accent : pressed ? c.surfacePressed : c.surface,
              borderColor: selected ? c.accent : c.glassBorder,
            },
            rimShadow(c, selected ? 'bright' : 'soft'),
          ]}>
          {icon}
          <Text variant="label" color={selected ? c.onAccent : c.text} style={selected ? { fontWeight: '700' } : undefined}>
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
});
