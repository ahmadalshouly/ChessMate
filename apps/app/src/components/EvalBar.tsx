import { evalBarFraction, type Color, type Score } from '@chessmate/core';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { formatEval } from '@/constants/analysis';
import { useT } from '@/i18n';

/**
 * Vertical evaluation bar. White's share fills from White's side of the
 * board, so it follows the board orientation.
 */
export function EvalBar({ score, orientation, height, width = 20 }: { score: Score | null; orientation: Color; height: number; width?: number }) {
  const tr = useT();
  const white = score ? evalBarFraction(score) : 0.5;
  const whiteOnBottom = orientation === 'w';
  const whiteAhead = white >= 0.5;
  const label = score ? formatEval(score).replace(/^[+-]/, '') : '';
  // Label sits at the end of the side that is ahead, in the contrasting colour.
  const labelAtBottom = whiteAhead === whiteOnBottom;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={score ? tr('analysis.evalA11y', { score: formatEval(score) }) : tr('analysis.evalPending')}
      style={[styles.bar, { width, height }]}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: height * white,
          backgroundColor: '#F5F5F7',
          ...(whiteOnBottom ? { bottom: 0 } : { top: 0 }),
        }}
      />
      {!!label && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.label,
            { color: whiteAhead ? '#0B0B0C' : '#F5F5F7', fontSize: Math.min(10, width * 0.45), letterSpacing: -0.3 },
            labelAtBottom ? { bottom: 3 } : { top: 3 },
          ]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#1B1B1F', borderRadius: 4, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(127,127,135,0.5)' },
  label: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontWeight: '700' },
});
