import * as FLAGS from 'country-flag-icons/string/3x2';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';

import { countryLabel } from '@/i18n/chess';
import { Text, useAppTheme } from '@/ui';

const SVGS = FLAGS as unknown as Record<string, string | undefined>;

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2 code ("DE"). Nothing is drawn for an empty or unknown code. */
  code: string | null | undefined;
  /** Flag height in px; the width is 1.5x (3:2). Default 12. */
  size?: number;
  /**
   * Hide the flag from screen readers when the country name is already read out
   * next to it (or by a parent's accessibilityLabel). Default false: the flag is
   * announced as the country's name.
   */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A small country flag drawn from bundled SVGs, so it looks the same on web
 * (including Windows browsers, which show flag emoji as two letters), iOS and
 * Android. Screen readers hear the country's name in the app's language.
 */
export const CountryFlag = memo(function CountryFlag({ code, size = 12, decorative, style }: CountryFlagProps) {
  const c = useAppTheme().colors;
  const iso = code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
  if (!iso) return null;
  const xml = SVGS[iso];
  const label = countryLabel(iso) ?? iso;
  const width = Math.round(size * 1.5);
  const a11y = decorative
    ? ({ accessible: false, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true } as const)
    : ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const);

  if (!xml) {
    // A code with no bundled flag: show the code itself, still labelled.
    return (
      <View {...a11y} style={style}>
        <Text variant="caption" tone="muted">
          {iso}
        </Text>
      </View>
    );
  }
  // One flag (Andorra, in the CommonJS build) styles its emblem with CSS classes.
  const Svg = xml.includes('<style') ? SvgCss : SvgXml;
  return (
    <View
      {...a11y}
      style={[styles.frame, { width, height: size, borderRadius: Math.max(2, Math.round(size / 6)), borderColor: c.border }, style]}>
      <Svg xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
    </View>
  );
});

const styles = StyleSheet.create({
  // Hairline frame so white flags (Japan, Finland) keep their edge on a white surface.
  frame: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, flexShrink: 0 },
});
