import { Game, premoveDests, type Square } from '@chessmate/core';
import { useMemo, useState } from 'react';

import { playClient, type GameView } from './playClient';

/**
 * Tap-to-move for a live game. On your turn it shows legal moves; while the
 * opponent is thinking it queues a premove (tap the queued piece or any empty
 * spot to cancel it).
 */
export function usePlayBoard(view: GameView | null) {
  const [selected, setSelected] = useState<Square | null>(null);
  const fen = view?.fen;
  const game = useMemo(() => (fen ? new Game(fen) : null), [fen]);
  const live = !!view && !view.outcome && !!game;
  const myTurn = live && game!.turn === view!.you;

  const targets: Square[] =
    !live || !selected ? [] : myTurn ? game!.legalMoves(selected).map((m) => m.to) : premoveDests(view!.fen, view!.you, selected);

  const onSquarePress = (sq: Square) => {
    if (!live || !view || !game) return;
    const piece = game.raw.get(sq);
    if (selected && targets.includes(sq)) {
      if (myTurn) {
        const move = game.legalMoves(selected).find((m) => m.to === sq);
        if (move) playClient.move(`${move.from}${move.to}${move.promotion ? 'q' : ''}`);
      } else {
        playClient.setPremove({ from: selected, to: sq });
      }
      setSelected(null);
      return;
    }
    if (!myTurn && view.premove) playClient.setPremove(null);
    if (piece && piece.color === view.you) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  return { selected, targets, onSquarePress, myTurn };
}
