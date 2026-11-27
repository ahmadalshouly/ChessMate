import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MOVE_CLASS } from '@/constants/analysis';
import { Button, REVIEW_BLACK, Text, useAppTheme, type ButtonSize } from '@/ui';

/** The "!!" of a Brilliant move, in its teal, that marks every Review button. */
export function ReviewMark({ size = 22 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { width: size, height: size, borderRadius: size / 2, backgroundColor: MOVE_CLASS.brilliant.color }]}>
      <Text color="#FFFFFF" style={{ fontSize: Math.round(size * 0.56), lineHeight: Math.round(size * 0.7), fontWeight: '900', letterSpacing: -1 }}>
        !!
      </Text>
    </View>
  );
}

const MARK = { sm: 20, md: 24, lg: 28 } as const;

/**
 * Every button that opens a game review looks the same, so players spot it:
 * black (in light and dark themes) with the "!!" Brilliant badge before the
 * label. The label can be the game's accuracy once it is reviewed.
 */
export function ReviewButton({
  title,
  onPress,
  size = 'md',
  fullWidth,
  disabled,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Button
      variant="review"
      title={title}
      onPress={onPress}
      size={size}
      fullWidth={fullWidth}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={style}
      leftIcon={<ReviewMark size={MARK[size]} />}
    />
  );
}

/**
 * The same look for the plain pill buttons on game screens (result card,
 * board notices), which are not built on Button: `height` and `radius` match
 * the buttons beside it.
 */
export function ReviewPill({
  label,
  onPress,
  height = 44,
  flex,
  disabled,
}: {
  label: string;
  onPress: () => void;
  height?: number;
  /** Shares the row with other buttons. */
  flex?: boolean;
  disabled?: boolean;
}) {
  const dark = useAppTheme().colors.scheme === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        flex && styles.flex,
        { height, borderRadius: height / 2, borderColor: dark ? 'rgba(255,255,255,0.22)' : REVIEW_BLACK, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}>
      <ReviewMark size={Math.round(height * 0.55)} />
      <View style={styles.textWrap}>
        <Text variant="label" color="#FFFFFF" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: REVIEW_BLACK,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  textWrap: { flexShrink: 1 },
});
