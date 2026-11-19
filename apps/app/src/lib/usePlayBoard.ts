import { Game, premoveDests, type Square } from '@chessmate/core';
import { useEffect, useMemo, useState } from 'react';

import type { PromotionPiece } from '@/components/Board';
import { useSettings } from '@/features/account/settingsStore';

import { haptic } from './haptics';
import { promotionChoice, type PendingPromotion } from './useBoardInteraction';
import { playClient, type GameView } from './playClient';

/**
 * Tap-to-move and drag-and-drop for a live game. On your turn it shows legal
 * moves; while the opponent is thinking it queues a premove when premoves are
 * on in settings. Tap the queued piece or any empty spot, or right-click on
 * the web, to cancel it.
 */
export function usePlayBoard(view: GameView | null, onMove: (uci: string) => boolean = (uci) => playClient.move(uci)) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promoting, setPromoting] = useState<(PendingPromotion & { premove: boolean }) | null>(null);
  const { premoves: premovesOn, autoQueen } = useSettings().gameplay;
  const fen = view?.fen;
  const game = useMemo(() => (fen ? new Game(fen) : null), [fen]);
  const live = !!view && !view.outcome && !!game;
  const myTurn = live && game!.turn === view!.you;
  const canPremove = live && !myTurn && premovesOn;
  const queued = view?.premove ?? null;

  // Turning premoves off drops anything already queued.
  useEffect(() => {
    if (!premovesOn && queued) playClient.setPremove(null);
  }, [premovesOn, queued]);

  const destsFrom = (from: Square): Square[] =>
    !live ? [] : myTurn ? game!.legalMoves(from).map((m) => m.to) : canPremove ? premoveDests(view!.fen, view!.you, from) : [];
  const targets: Square[] = selected ? destsFrom(selected) : [];

  const movable = (sq: Square) => {
    const piece = game?.raw.get(sq);
    return !!piece && !!view && piece.color === view.you && (myTurn || canPremove);
  };

  /** A pawn reaching the last rank (for premoves, where the move is not legal yet). */
  const isPromotion = (from: Square, to: Square) => {
    const piece = game?.raw.get(from);
    return piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
  };

  const commit = (from: Square, to: Square): boolean => {
    if (!destsFrom(from).includes(to)) return false;
    if (myTurn) {
      const move = game!.legalMoves(from).find((m) => m.to === to);
      if (!move) return false;
      if (move.promotion && !autoQueen) {
        setPromoting({ fen: view!.fen, from, to, color: view!.you, premove: false });
        return true;
      }
      return onMove(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
    }
    if (isPromotion(from, to) && !autoQueen) {
      setPromoting({ fen: view!.fen, from, to, color: view!.you, premove: true });
      return true;
    }
    playClient.setPremove({ from, to });
    return true;
  };

  const pick = (p: PendingPromotion & { premove: boolean }, piece: PromotionPiece) => {
    setPromoting(null);
    if (p.premove) playClient.setPremove({ from: p.from, to: p.to, promotion: piece });
    else onMove(`${p.from}${p.to}${piece}`);
  };
  const promotion = fen ? promotionChoice(promoting, fen, pick, () => setPromoting(null)) : null;

  const onSquarePress = (sq: Square) => {
    if (!live || !view || !game) return;
    if (selected && targets.includes(sq)) {
      commit(selected, sq);
      setSelected(null);
      return;
    }
    if (!myTurn && queued) playClient.setPremove(null);
    if (movable(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onPieceDrop = (from: Square, to: Square) => {
    setSelected(null);
    if (!live || !movable(from)) return;
    if (!commit(from, to)) haptic('illegal');
  };

  const cancel = () => {
    setSelected(null);
    setPromoting(null);
    if (queued) playClient.setPremove(null);
  };

  return { selected, targets, onSquarePress, myTurn, canPremove, cancel, promotion, dragProps: { canDrag: movable, onPieceDrop, onCancel: cancel, promotion } };
}
