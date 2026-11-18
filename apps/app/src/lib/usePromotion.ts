import type { Color, PromotionPiece, Square } from '@chessmate/core';
import { useCallback, useState } from 'react';

import { useSettings } from '@/features/account/settingsStore';

/** What <Board> needs to show the promotion picker. */
export interface PromotionPrompt {
  /** Square the pawn is promoting on; the picker opens over it. */
  square: Square;
  color: Color;
  /** A piece was picked, or null when the picker was dismissed. */
  onPick: (piece: PromotionPiece | null) => void;
}

/**
 * Promotion choice for a board. With "auto-queen" on in Settings > Gameplay a
 * pawn always becomes a queen; otherwise `ask` opens the picker on the board
 * (pass `prompt` to <Board promotion>) and calls `done` with the chosen piece.
 * `alwaysAsk` ignores the setting (puzzles, where an underpromotion may be the answer).
 */
export function usePromotion({ alwaysAsk = false }: { alwaysAsk?: boolean } = {}) {
  const autoQueen = useSettings().gameplay.autoQueen && !alwaysAsk;
  const [pending, setPending] = useState<{ square: Square; color: Color; done: (p: PromotionPiece) => void } | null>(null);

  const ask = useCallback(
    (square: Square, color: Color, done: (piece: PromotionPiece) => void) => {
      if (autoQueen) done('q');
      else setPending({ square, color, done });
    },
    [autoQueen],
  );

  const prompt: PromotionPrompt | null = pending
    ? {
        square: pending.square,
        color: pending.color,
        onPick: (piece) => {
          setPending(null);
          if (piece) pending.done(piece);
        },
      }
    : null;

  return { ask, prompt, cancel: () => setPending(null), open: !!pending };
}
