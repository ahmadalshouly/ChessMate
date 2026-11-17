import { ALL_SQUARES, FILES, Game, type Color, type Piece, type Square } from '@chessmate/core';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/primitives';

import { useBoardAppearance } from '@/features/account/boardThemes';
import { useBoardTheme, type BoardTheme } from '@/ui';

// Text presentation selector (U+FE0E) stops platforms rendering pieces as emoji.
const GLYPH: Record<string, string> = {
  k: '♚︎',
  q: '♛︎',
  r: '♜︎',
  b: '♝︎',
  n: '♞︎',
  p: '♟︎',
};

const PREMOVE_TINT = 'rgba(64, 104, 168, 0.42)';

export interface BoardProps {
  /** Position to display. Boards are driven by immutable FEN strings. */
  fen: string;
  orientation: Color;
  size: number;
  selected?: Square | null;
  targets?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  checkSquare?: Square | null;
  /** Squares to tint as under threat (feedback mode only). */
  threatened?: Square[];
  /** Queued premove, tinted until it plays or is cancelled. */
  premove?: { from: string; to: string } | null;
  onSquarePress?: (square: Square) => void;
  /** Override the user's board theme (previews). Defaults to the theme chosen in settings. */
  theme?: BoardTheme;
}

function pieceAt(position: (Piece | null)[][], sq: Square): Piece | null {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  return position[8 - rank]?.[file] ?? null;
}

export const Board = memo(function Board(props: BoardProps) {
  const { fen, orientation, size, selected, targets = [], lastMove, checkSquare, threatened = [], premove, onSquarePress } = props;
  const { boardTheme } = useBoardTheme();
  const colors = props.theme ?? boardTheme;
  const position = useMemo(() => new Game(fen).raw.board() as (Piece | null)[][], [fen]);
  const cell = size / 8;
  // Coordinates, legal-move dots and last-move highlight follow the user's board settings.
  const look = useBoardAppearance();
  const squares = useMemo(() => {
    const ordered = [...ALL_SQUARES].sort((a, b) => {
      const ra = Number(a[1]);
      const rb = Number(b[1]);
      if (ra !== rb) return orientation === 'w' ? rb - ra : ra - rb;
      return orientation === 'w' ? a.charCodeAt(0) - b.charCodeAt(0) : b.charCodeAt(0) - a.charCodeAt(0);
    });
    return ordered;
  }, [orientation]);
  const targetSet = new Set(targets);
  const threatSet = new Set(threatened);

  return (
    <View style={[styles.board, { width: size, height: size }]} accessibilityRole="grid">
      {squares.map((sq, i) => {
        const fileIdx = sq.charCodeAt(0) - 97;
        const rank = Number(sq[1]);
        const isLight = (fileIdx + rank) % 2 === 0;
        const piece = pieceAt(position, sq);
        const row = Math.floor(i / 8);
        const col = i % 8;
        const overlays: string[] = [];
        if (look.highlightLastMove && lastMove && (lastMove.from === sq || lastMove.to === sq)) overlays.push(colors.lastMove);
        if (threatSet.has(sq)) overlays.push(colors.threat);
        if (premove && (premove.from === sq || premove.to === sq)) overlays.push(PREMOVE_TINT);
        if (selected === sq) overlays.push(colors.selected);
        if (checkSquare === sq) overlays.push(colors.check);
        return (
          <Pressable
            key={sq}
            onPress={() => onSquarePress?.(sq)}
            accessibilityLabel={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
            style={{
              position: 'absolute',
              left: col * cell,
              top: row * cell,
              width: cell,
              height: cell,
              backgroundColor: isLight ? colors.light : colors.dark,
            }}>
            {overlays.map((c, k) => (
              <View key={k} style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />
            ))}
            {look.coordinates && col === 0 && (
              <Text style={[styles.coord, { color: isLight ? colors.coordOnLight : colors.coordOnDark, top: 2, left: 3, fontSize: cell * 0.18 }]}>{rank}</Text>
            )}
            {look.coordinates && row === 7 && (
              <Text style={[styles.coord, { color: isLight ? colors.coordOnLight : colors.coordOnDark, bottom: 1, right: 3, fontSize: cell * 0.18 }]}>
                {FILES[fileIdx]}
              </Text>
            )}
            {piece && (
              <Text
                style={[
                  styles.piece,
                  {
                    fontSize: cell * 0.78,
                    lineHeight: cell,
                    color: piece.color === 'w' ? colors.whitePiece : colors.blackPiece,
                    textShadowColor: piece.color === 'w' ? colors.whitePieceOutline : colors.blackPieceOutline,
                  },
                ]}>
                {GLYPH[piece.type]}
              </Text>
            )}
            {look.showLegalMoves && targetSet.has(sq) && (
              <View
                pointerEvents="none"
                style={
                  piece
                    ? [StyleSheet.absoluteFill, { borderWidth: cell * 0.07, borderColor: colors.hint, borderRadius: cell / 2 }]
                    : { position: 'absolute', left: cell * 0.36, top: cell * 0.36, width: cell * 0.28, height: cell * 0.28, borderRadius: cell, backgroundColor: colors.hint }
                }
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  board: { borderRadius: 6, overflow: 'hidden' },
  coord: { position: 'absolute', fontWeight: '700' },
  piece: { textAlign: 'center', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
});
