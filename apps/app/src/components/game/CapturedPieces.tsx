import type { Color, MaterialSide } from '@chessmate/core';
import { Image, StyleSheet, View } from 'react-native';

import { useBoardAppearance } from '@/features/account/boardThemes';
import { pieceImage } from '@/features/board/pieceSets';
import { Text } from '@/ui';

const SIZE = 15;

export interface CapturedPiecesProps extends MaterialSide {
  /** Colour of the pieces that were taken (the opponent's colour). */
  color: Color;
}

/**
 * Pieces a player has taken, grouped by type (pawns first), followed by their
 * material lead such as "+3". Drawn in the user's piece set.
 */
export function CapturedPieces({ captured, advantage, color }: CapturedPiecesProps) {
  const { pieces: set } = useBoardAppearance();
  if (captured.length === 0 && advantage === 0) return null;

  const groups: { type: string; n: number }[] = [];
  for (const type of captured) {
    const g = groups[groups.length - 1];
    if (g?.type === type) g.n++;
    else groups.push({ type, n: 1 });
  }

  return (
    <View style={styles.row} accessibilityLabel={advantage > 0 ? `+${advantage}` : undefined}>
      {groups.map((g) => (
        <View key={g.type} style={styles.group}>
          {Array.from({ length: g.n }, (_, i) => (
            <Image
              key={i}
              source={pieceImage(set, color, g.type)}
              style={[styles.piece, i > 0 && styles.overlap]}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      ))}
      {advantage > 0 && (
        <Text variant="caption" tone="muted" style={styles.adv}>
          +{advantage}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, overflow: 'hidden' },
  group: { flexDirection: 'row' },
  piece: { width: SIZE, height: SIZE },
  overlap: { marginStart: -SIZE * 0.55 },
  adv: { fontVariant: ['tabular-nums'], marginStart: 2 },
});
