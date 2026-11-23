import { Game, type Color, type Square } from '@chessmate/core';
import { useMemo, useState } from 'react';

import { illegalMoveFeedback } from './feedback';

/**
 * Tap-to-move and drag-and-drop for boards played on this device: tap a piece
 * to see its moves and tap a target, or drag the piece there. Spread
 * `dragProps` onto <Board> to enable dragging.
 */
export function useBoardInteraction(fen: string, canMove: (color: Color) => boolean, play: (uci: string) => boolean) {
  const [selected, setSelected] = useState<Square | null>(null);
  const game = useMemo(() => new Game(fen), [fen]);
  const targets = selected ? game.legalMoves(selected).map((m) => m.to) : [];

  const movable = (sq: Square) => {
    const piece = game.raw.get(sq);
    return !!piece && piece.color === game.turn && canMove(piece.color);
  };

  /** Plays from→to if legal (auto-queen for now; a promotion picker is on the roadmap). */
  const tryMove = (from: Square, to: Square) => {
    const move = game.legalMoves(from).find((m) => m.to === to);
    return !!move && play(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
  };

  const onSquarePress = (sq: Square) => {
    if (selected && targets.includes(sq)) {
      tryMove(selected, sq);
      setSelected(null);
      return;
    }
    if (movable(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onPieceDrop = (from: Square, to: Square) => {
    setSelected(null);
    if (!movable(from)) return;
    // An illegal drop snaps back; a thud and a short buzz say why nothing happened.
    // A legal move the screen turns down (e.g. a wrong puzzle answer) is not illegal.
    if (!game.legalMoves(from).some((m) => m.to === to)) return illegalMoveFeedback();
    tryMove(from, to);
  };

  const clear = () => setSelected(null);

  return { selected, targets, onSquarePress, clear, dragProps: { canDrag: movable, onPieceDrop, onCancel: clear } };
}

export function checkSquareOf(fen: string): Square | null {
  const game = new Game(fen);
  if (!game.inCheck) return null;
  for (const row of game.raw.board()) for (const p of row) if (p && p.type === 'k' && p.color === game.turn) return p.square as Square;
  return null;
}
