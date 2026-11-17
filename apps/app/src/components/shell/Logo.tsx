import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/constants/theme';
import { fonts } from '@/ui';
import { Text } from '@/ui/primitives';

/** The ChessMate mark (queen and crowned knight). One black PNG, tinted for the theme. */
const MARK = require('../../../assets/brand/mark.png');
/** Width / height of the traced mark (assets/brand/chessmate-mark.svg). */
const MARK_RATIO = 1597 / 1678;

/** Line-art mark, optionally followed by the CHESSMATE wordmark set in Montserrat. */
export function Logo({ size = 32, wordmark = true, color }: { size?: number; wordmark?: boolean; color?: string }) {
  const t = useTheme();
  const ink = color ?? t.text;
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="ChessMate">
      <Image source={MARK} style={{ width: size * MARK_RATIO, height: size, tintColor: ink }} resizeMode="contain" />
      {wordmark && <Text style={[styles.word, { color: ink, fontSize: size * 0.5, letterSpacing: size * 0.06 }]}>CHESSMATE</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontFamily: fonts.displayMedium },
});
