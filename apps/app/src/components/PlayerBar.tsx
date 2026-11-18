import type { PlayerInfo } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { PlayerCard } from '@/components/game/PlayerCard';

/** A player beside the board (spectator view): the game screen's player card. */
export function PlayerBar({ player, ms, active, offline }: { player: PlayerInfo | null; ms: number | null; active: boolean; offline?: boolean }) {
  return <PlayerCard player={player} ms={ms} active={active} offline={offline} />;
}

/** Re-renders every 100 ms while `running` so clocks tick smoothly. */
export function useTicker(running: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setN((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [running]);
}
