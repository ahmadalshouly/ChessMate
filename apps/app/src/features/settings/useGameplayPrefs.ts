import { Game, type Square, type TimeCategory } from '@chessmate/core';
import { useState } from 'react';

import { useSettings } from '@/features/account/settingsStore';

/**
 * Applies the "confirm moves" and "confirm resign" settings to a game.
 * Wrap the move sender; when confirmation is on, moves wait in `pending`
 * until confirm() is called.
 */
export function useGameplayPrefs(fen: string, category: TimeCategory, send: (uci: string) => boolean) {
  const { gameplay } = useSettings();
  const [pending, setPending] = useState<{ uci: string; san: string; from: Square; to: Square } | null>(null);
  const [resignAsked, setResignAsked] = useState(false);
  const needConfirm = gameplay.confirmMoves === 'always' || (gameplay.confirmMoves === 'correspondence' && category === 'correspondence');

  const move = (uci: string): boolean => {
    if (!needConfirm) return send(uci);
    const legal = new Game(fen).legalMoves().find((m) => `${m.from}${m.to}` === uci.slice(0, 4));
    if (!legal) return false;
    setPending({ uci, san: legal.san, from: legal.from as Square, to: legal.to as Square });
    return true;
  };

  return {
    move,
    pending,
    confirm: () => {
      if (pending) send(pending.uci);
      setPending(null);
    },
    cancel: () => setPending(null),
    /** Returns true when the caller should resign now. */
    requestResign: () => {
      if (!gameplay.confirmResign || resignAsked) {
        setResignAsked(false);
        return true;
      }
      setResignAsked(true);
      return false;
    },
    resignAsked,
    cancelResign: () => setResignAsked(false),
  };
}
