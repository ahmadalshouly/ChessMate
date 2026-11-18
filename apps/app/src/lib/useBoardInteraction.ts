import { Game, type Color, type Square } from '@chessmate/core';
import { useMemo, useState } from 'react';

import { haptic } from './haptics';
import { usePromotion } from './usePromotion';

/**
 * Tap-to-move and drag-and-drop for boards played on this device: tap a piece
 * to see its moves and tap a target, or drag the piece there. Spread
 * `dragProps` onto <Board> to enable dragging, and pass `promotion` to
 * <Board promotion> so a pawn reaching the last rank can pick its piece.
 */
export function useBoardInteraction(fen: string, canMove: (color: Color) => boolean, play: (uci: string) => boolean, opts: { alwaysAskPromotion?: boolean } = {}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const game = useMemo(() => new Game(fen), [fen]);
  const promo = usePromotion({ alwaysAsk: opts.alwaysAskPromotion });
  const targets = selected ? game.legalMoves(selected).map((m) => m.to) : [];

  const movable = (sq: Square) => {
    const piece = game.raw.get(sq);
    return !promo.open && !!piece && piece.color === game.turn && canMove(piece.color);
  };

  /** Plays from→to if legal. A promotion asks for the piece first (or queens, with auto-queen on). */
  const tryMove = (from: Square, to: Square) => {
    const move = game.legalMoves(from).find((m) => m.to === to);
    if (!move) return false;
    if (!move.promotion) return play(`${move.from}${move.to}`);
    promo.ask(to, game.turn, (piece) => play(`${move.from}${move.to}${piece}`));
    return true;
  };

  const onSquarePress = (sq: Square) => {
    if (promo.open) return;
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
    // An illegal drop snaps back; a short buzz says why nothing happened.
    if (!tryMove(from, to)) haptic('illegal');
  };

  const clear = () => {
    setSelected(null);
    promo.cancel();
  };

  return { selected, targets, onSquarePress, clear, promotion: promo.prompt, dragProps: { canDrag: movable, onPieceDrop, onCancel: clear } };
}

export function checkSquareOf(fen: string): Square | null {
  const game = new Game(fen);
  if (!game.inCheck) return null;
  for (const row of game.raw.board()) for (const p of row) if (p && p.type === 'k' && p.color === game.turn) return p.square as Square;
  return null;
}
