import { Game, type Color, type Square } from '@chessmate/core';
import { useMemo, useState } from 'react';

import type { PromotionChoice, PromotionPiece } from '@/components/Board';
import { useSettings } from '@/features/account/settingsStore';

import { haptic } from './haptics';

/** A promotion waiting for the player to pick a piece, tied to the position it was made in. */
export interface PendingPromotion {
  fen: string;
  from: Square;
  to: Square;
  color: Color;
}

/**
 * Builds the Board's promotion prop. A pending promotion only counts in the
 * position it was made in, so a new position (opponent moved, undo) drops it.
 */
export function promotionChoice<T extends PendingPromotion>(pending: T | null, fen: string, pick: (p: T, piece: PromotionPiece) => void, cancel: () => void): PromotionChoice | null {
  if (!pending || pending.fen !== fen) return null;
  return { to: pending.to, color: pending.color, onPick: (piece) => pick(pending, piece), onCancel: cancel };
}

/**
 * Tap-to-move and drag-and-drop for boards played on this device: tap a piece
 * to see its moves and tap a target, or drag the piece there. Spread
 * `dragProps` onto <Board> to enable dragging.
 */
export function useBoardInteraction(fen: string, canMove: (color: Color) => boolean, play: (uci: string) => boolean) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promoting, setPromoting] = useState<PendingPromotion | null>(null);
  const autoQueen = useSettings().gameplay.autoQueen;
  const game = useMemo(() => new Game(fen), [fen]);
  const targets = selected ? game.legalMoves(selected).map((m) => m.to) : [];

  const movable = (sq: Square) => {
    const piece = game.raw.get(sq);
    return !!piece && piece.color === game.turn && canMove(piece.color);
  };

  /** Plays from→to if legal. A promotion asks which piece, unless auto-queen is on in settings. */
  const tryMove = (from: Square, to: Square) => {
    const move = game.legalMoves(from).find((m) => m.to === to);
    if (!move) return false;
    if (move.promotion && !autoQueen) {
      setPromoting({ fen, from, to, color: game.turn });
      return true;
    }
    return play(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
  };

  const promotion = promotionChoice(
    promoting,
    fen,
    (p, piece) => {
      setPromoting(null);
      play(`${p.from}${p.to}${piece}`);
    },
    () => setPromoting(null),
  );

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
    // An illegal drop snaps back; a short buzz says why nothing happened.
    if (!tryMove(from, to)) haptic('illegal');
  };

  const clear = () => {
    setSelected(null);
    setPromoting(null);
  };

  // Spread `dragProps` onto <Board>: it carries dragging and the promotion choice.
  return { selected, targets, onSquarePress, clear, promotion, dragProps: { canDrag: movable, onPieceDrop, onCancel: clear, promotion } };
}

export function checkSquareOf(fen: string): Square | null {
  const game = new Game(fen);
  if (!game.inCheck) return null;
  for (const row of game.raw.board()) for (const p of row) if (p && p.type === 'k' && p.color === game.turn) return p.square as Square;
  return null;
}
