import { Game, premoveDests, type Square } from '@chessmate/core';
import { useEffect, useMemo, useState } from 'react';

import { useSettings } from '@/features/account/settingsStore';

import { haptic } from './haptics';
import { playClient, type GameView } from './playClient';

/**
 * Tap-to-move and drag-and-drop for a live game. On your turn it shows legal
 * moves; while the opponent is thinking it queues a premove when premoves are
 * on in settings. Tap the queued piece or any empty spot, or right-click on
 * the web, to cancel it.
 */
export function usePlayBoard(view: GameView | null, onMove: (uci: string) => boolean = (uci) => playClient.move(uci)) {
  const [selected, setSelected] = useState<Square | null>(null);
  const premovesOn = useSettings().gameplay.premoves;
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

  const commit = (from: Square, to: Square): boolean => {
    if (!destsFrom(from).includes(to)) return false;
    if (myTurn) {
      const move = game!.legalMoves(from).find((m) => m.to === to);
      return !!move && onMove(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
    }
    playClient.setPremove({ from, to });
    return true;
  };

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
    if (queued) playClient.setPremove(null);
  };

  return { selected, targets, onSquarePress, myTurn, canPremove, cancel, dragProps: { canDrag: movable, onPieceDrop, onCancel: cancel } };
}
