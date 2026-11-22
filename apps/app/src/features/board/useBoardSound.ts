import { Game } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { moveSound, playMoveSound, positionKey } from '@/lib/sounds';

/** The SAN of the one move that turns `from` into `to`, or null when it is not a single move. */
function moveBetween(from: string, to: string): string | null {
  const target = positionKey(to);
  try {
    const g = new Game(from);
    const after = new Game(to);
    // Only moves that leave one of the mover's pieces on the destination can be it, which
    // is usually one or two candidates instead of every legal move. This runs as the move
    // animates, so it is kept short.
    const mover = g.turn;
    for (const m of g.legalMoves()) {
      if (after.raw.get(m.to)?.color !== mover) continue;
      const next = new Game(from);
      if (next.move(`${m.from}${m.to}${m.promotion ?? ''}`) && positionKey(next.fen) === target) return m.san;
    }
  } catch {
    // Not a position the rules can read (a variant or a setup): stay quiet.
  }
  return null;
}

/**
 * Every board sounds its moves: when the position changes by exactly one move, forward
 * (a move played, received or replayed) or back (stepping through a game), the move's
 * sound plays. Loading another game or jumping several moves stays quiet.
 */
export function useBoardSound(fen: string, enabled: boolean) {
  const prev = useRef(fen);
  useEffect(() => {
    const before = prev.current;
    prev.current = fen;
    if (!enabled || before === fen || positionKey(before) === positionKey(fen)) return;
    const forward = moveBetween(before, fen);
    if (forward) return playMoveSound(moveSound(forward), fen);
    // Stepping back: the sound of the move being taken back.
    const back = moveBetween(fen, before);
    if (back) playMoveSound(moveSound(back));
  }, [fen, enabled]);
}
