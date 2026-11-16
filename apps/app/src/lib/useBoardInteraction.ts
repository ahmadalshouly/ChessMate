import { Game, type Color, type Square } from '@chessmate/core';
import { useMemo, useState } from 'react';

/** Tap-to-move: tap a piece to see its moves, tap a target to play. */
export function useBoardInteraction(fen: string, canMove: (color: Color) => boolean, play: (uci: string) => boolean) {
  const [selected, setSelected] = useState<Square | null>(null);
  const game = useMemo(() => new Game(fen), [fen]);
  const targets = selected ? game.legalMoves(selected).map((m) => m.to) : [];

  const onSquarePress = (sq: Square) => {
    const piece = game.raw.get(sq);
    if (selected) {
      const move = game.legalMoves(selected).find((m) => m.to === sq);
      if (move) {
        // Auto-queen for now; a promotion picker is on the roadmap.
        play(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
        setSelected(null);
        return;
      }
    }
    if (piece && piece.color === game.turn && canMove(piece.color)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  return { selected, targets, onSquarePress, clear: () => setSelected(null) };
}

export function checkSquareOf(fen: string): Square | null {
  const game = new Game(fen);
  if (!game.inCheck) return null;
  for (const row of game.raw.board()) for (const p of row) if (p && p.type === 'k' && p.color === game.turn) return p.square as Square;
  return null;
}
