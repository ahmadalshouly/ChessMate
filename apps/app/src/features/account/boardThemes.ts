import type { BoardTheme, PieceSet } from '@chessmate/core';

import { useSettings } from './settingsStore';

/** Original monochrome board themes. Highlight colours stay the same across themes. */
export const BOARD_THEME_COLORS: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  graphite: { label: 'Graphite', light: '#EDEDEF', dark: '#8E8E96' },
  marble: { label: 'Marble', light: '#F3F1EC', dark: '#B4AFA5' },
  slate: { label: 'Slate', light: '#DCE1E6', dark: '#5F6A75' },
  contrast: { label: 'High contrast', light: '#FFFFFF', dark: '#2B2B30' },
};

export const PIECE_SET_LABELS: Record<PieceSet, string> = { classic: 'Classic', outline: 'Outline', bold: 'Bold' };

const FILLED: Record<string, string> = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
const HOLLOW: Record<string, string> = { k: '♔︎', q: '♕︎', r: '♖︎', b: '♗︎', n: '♘︎', p: '♙︎' };

export interface PieceStyle {
  glyph: string;
  color: string;
  shadow: string;
  shadowRadius: number;
  scale: number;
}

/** How to draw a piece in a given set. Unicode glyphs keep pieces original and license-free. */
export function pieceStyle(set: PieceSet, type: string, color: 'w' | 'b'): PieceStyle {
  const white = color === 'w';
  switch (set) {
    case 'outline':
      return { glyph: white ? HOLLOW[type]! : FILLED[type]!, color: '#15171B', shadow: 'rgba(255,255,255,0.6)', shadowRadius: 1, scale: 0.8 };
    case 'bold':
      return { glyph: FILLED[type]!, color: white ? '#FFFFFF' : '#0B0B0C', shadow: white ? '#0B0B0C' : 'rgba(255,255,255,0.55)', shadowRadius: 3, scale: 0.86 };
    default:
      return { glyph: FILLED[type]!, color: white ? '#FFFFFF' : '#15171B', shadow: white ? '#15171B' : 'rgba(255,255,255,0.35)', shadowRadius: 2, scale: 0.78 };
  }
}

/** Board look from the user's settings. */
export function useBoardAppearance() {
  const { board } = useSettings();
  return { squares: BOARD_THEME_COLORS[board.theme], pieces: board.pieces, coordinates: board.coordinates, highlightLastMove: board.highlightLastMove, showLegalMoves: board.showLegalMoves };
}
