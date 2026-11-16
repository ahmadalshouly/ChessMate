import { ALL_SQUARES, FILES, Game, type Color, type Piece, type Square } from '@chessmate/core';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { board as colors } from '@/constants/theme';
import { pieceStyle, useBoardAppearance } from '@/features/account/boardThemes';

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
  onSquarePress?: (square: Square) => void;
}

function pieceAt(position: (Piece | null)[][], sq: Square): Piece | null {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  return position[8 - rank]?.[file] ?? null;
}

export const Board = memo(function Board(props: BoardProps) {
  const { fen, orientation, size, selected, targets = [], lastMove, checkSquare, threatened = [], onSquarePress } = props;
  const position = useMemo(() => new Game(fen).raw.board() as (Piece | null)[][], [fen]);
  const cell = size / 8;
  // Square colours, piece set and markers follow the user's board settings.
  const look = useBoardAppearance();
  const sqColors = look.squares;
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
              backgroundColor: isLight ? sqColors.light : sqColors.dark,
            }}>
            {overlays.map((c, k) => (
              <View key={k} style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />
            ))}
            {look.coordinates && col === 0 && (
              <Text style={[styles.coord, { color: isLight ? sqColors.dark : sqColors.light, top: 2, left: 3, fontSize: cell * 0.18 }]}>{rank}</Text>
            )}
            {look.coordinates && row === 7 && (
              <Text style={[styles.coord, { color: isLight ? sqColors.dark : sqColors.light, bottom: 1, right: 3, fontSize: cell * 0.18 }]}>
                {FILES[fileIdx]}
              </Text>
            )}
            {piece && <PieceGlyph type={piece.type} color={piece.color} set={look.pieces} cell={cell} />}
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

function PieceGlyph({ type, color, set, cell }: { type: string; color: Color; set: Parameters<typeof pieceStyle>[0]; cell: number }) {
  const p = pieceStyle(set, type, color);
  return (
    <Text
      style={[
        styles.piece,
        { fontSize: cell * p.scale, lineHeight: cell, color: p.color, textShadowColor: p.shadow, textShadowRadius: p.shadowRadius },
      ]}>
      {p.glyph}
    </Text>
  );
}

const styles = StyleSheet.create({
  board: { borderRadius: 6, overflow: 'hidden' },
  coord: { position: 'absolute', fontWeight: '700' },
  piece: { textAlign: 'center', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
});
