import { Game, type Color, type Square } from '@chessmate/core';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { PromotionChoice, PromotionPiece } from '@/components/Board';
import { useSettings } from '@/features/account/settingsStore';

import { illegalMoveFeedback } from './feedback';

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
  const targets = useMemo(() => (selected ? game.legalMoves(selected).map((m) => m.to) : NO_TARGETS), [game, selected]);

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

  const onSquarePressNow = (sq: Square) => {
    if (selected && targets.includes(sq)) {
      tryMove(selected, sq);
      setSelected(null);
      return;
    }
    if (movable(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onPieceDropNow = (from: Square, to: Square) => {
    setSelected(null);
    if (!movable(from)) return;
    // An illegal drop snaps back; a thud and a short buzz say why nothing happened.
    // A legal move the screen turns down (e.g. a wrong puzzle answer) is not illegal.
    if (!game.legalMoves(from).some((m) => m.to === to)) return illegalMoveFeedback();
    tryMove(from, to);
  };

  // The board is memoised: hand it callbacks that never change identity and read the
  // latest position through a ref, so a parent re-render (a clock tick, a status line)
  // does not redraw the board.
  const latest = useRef({ onSquarePress: onSquarePressNow, onPieceDrop: onPieceDropNow, movable, play });
  latest.current = { onSquarePress: onSquarePressNow, onPieceDrop: onPieceDropNow, movable, play };
  const onSquarePress = useCallback((sq: Square) => latest.current.onSquarePress(sq), []);
  const onPieceDrop = useCallback((from: Square, to: Square) => latest.current.onPieceDrop(from, to), []);
  const canDrag = useCallback((sq: Square) => latest.current.movable(sq), []);
  const clear = useCallback(() => {
    setSelected(null);
    setPromoting(null);
  }, []);

  const promotion = useMemo(
    () =>
      promotionChoice(
        promoting,
        fen,
        (p, piece) => {
          setPromoting(null);
          latest.current.play(`${p.from}${p.to}${piece}`);
        },
        () => setPromoting(null),
      ),
    [promoting, fen],
  );

  // Spread `dragProps` onto <Board>: it carries dragging and the promotion choice.
  const dragProps = useMemo(() => ({ canDrag, onPieceDrop, onCancel: clear, promotion }), [canDrag, onPieceDrop, clear, promotion]);
  return { selected, targets, onSquarePress, clear, promotion, dragProps };
}

const NO_TARGETS: Square[] = [];

/** Square of the king in check in a position, or null. Cached: boards call this on every render. */
export function checkSquareOf(fen: string): Square | null {
  if (checkCache.has(fen)) return checkCache.get(fen)!;
  const sq = findCheckSquare(fen);
  if (checkCache.size > 64) checkCache.clear();
  checkCache.set(fen, sq);
  return sq;
}

const checkCache = new Map<string, Square | null>();

function findCheckSquare(fen: string): Square | null {
  const game = new Game(fen);
  if (!game.inCheck) return null;
  for (const row of game.raw.board()) for (const p of row) if (p && p.type === 'k' && p.color === game.turn) return p.square as Square;
  return null;
}
