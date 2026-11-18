import { Game, applyPremoves, isPromotionMove, premoveDests, type Square } from '@chessmate/core';
import { useEffect, useMemo, useState } from 'react';

import { useSettings } from '@/features/account/settingsStore';

import { haptic } from './haptics';
import { playClient, type GameView } from './playClient';
import { usePromotion } from './usePromotion';

/**
 * Tap-to-move and drag-and-drop for a live game. On your turn it shows legal
 * moves; while the opponent is thinking it queues premoves when premoves are
 * on in settings (as many as you like on the web, one on phones). Queued
 * premoves are drawn on `displayFen`, the position after they play, and the
 * next premove starts from there. Tap any empty spot, or right-click on the
 * web, to cancel the queue. Pass `promotion` to <Board promotion>.
 */
export function usePlayBoard(view: GameView | null, onMove: (uci: string) => boolean = (uci) => playClient.move(uci)) {
  const [selected, setSelected] = useState<Square | null>(null);
  const premovesOn = useSettings().gameplay.premoves;
  const promo = usePromotion();
  const fen = view?.fen;
  const game = useMemo(() => (fen ? new Game(fen) : null), [fen]);
  const live = !!view && !view.outcome && !!game;
  const myTurn = live && game!.turn === view!.you;
  const canPremove = live && !myTurn && premovesOn;
  const queue = useMemo(() => view?.premoves ?? [], [view?.premoves]);
  const displayFen = useMemo(() => (fen ? applyPremoves(fen, queue) : null), [fen, queue]);
  const display = useMemo(() => (displayFen ? new Game(displayFen) : null), [displayFen]);

  // Turning premoves off drops anything already queued.
  useEffect(() => {
    if (!premovesOn && queue.length) playClient.clearPremoves();
  }, [premovesOn, queue.length]);

  // The game ended (or a new one began) while the picker was open.
  const { cancel: cancelPromo } = promo;
  useEffect(() => {
    if (!live) cancelPromo();
  }, [live, cancelPromo]);

  const destsFrom = (from: Square): Square[] =>
    !live ? [] : myTurn ? game!.legalMoves(from).map((m) => m.to) : canPremove ? premoveDests(displayFen!, view!.you, from) : [];
  const targets: Square[] = selected ? destsFrom(selected) : [];

  const movable = (sq: Square) => {
    if (promo.open || !view) return false;
    const piece = (myTurn ? game : display)?.raw.get(sq);
    return !!piece && piece.color === view.you && (myTurn || canPremove);
  };

  const commit = (from: Square, to: Square): boolean => {
    if (!destsFrom(from).includes(to)) return false;
    if (myTurn) {
      const move = game!.legalMoves(from).find((m) => m.to === to);
      if (!move) return false;
      if (!move.promotion) return onMove(`${move.from}${move.to}`);
      promo.ask(to, view!.you, (piece) => onMove(`${move.from}${move.to}${piece}`));
      return true;
    }
    if (isPromotionMove(displayFen!, from, to)) promo.ask(to, view!.you, (promotion) => playClient.addPremove({ from, to, promotion }));
    else playClient.addPremove({ from, to });
    return true;
  };

  const onSquarePress = (sq: Square) => {
    if (!live || !view || !game || promo.open) return;
    if (selected && targets.includes(sq)) {
      commit(selected, sq);
      setSelected(null);
      return;
    }
    if (movable(sq)) setSelected(sq === selected ? null : sq);
    else {
      // Tapping off your pieces while premoves are queued cancels them.
      if (!myTurn && queue.length) playClient.clearPremoves();
      setSelected(null);
    }
  };

  const onPieceDrop = (from: Square, to: Square) => {
    setSelected(null);
    if (!live || !movable(from)) return;
    if (!commit(from, to)) haptic('illegal');
  };

  const cancel = () => {
    setSelected(null);
    promo.cancel();
    playClient.clearPremoves();
  };

  return {
    selected,
    targets,
    onSquarePress,
    myTurn,
    canPremove,
    cancel,
    /** Position to draw: the live one with queued premoves applied. */
    displayFen,
    premoves: queue,
    promotion: promo.prompt,
    dragProps: { canDrag: movable, onPieceDrop, onCancel: cancel },
  };
}
