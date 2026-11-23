import { opposite, type Color, type MaterialBalance, type PlayerInfo } from '@chessmate/core';
import { useEffect, useState } from 'react';

import { PlayerCard } from '@/components/game/PlayerCard';

/** A player beside the board (spectator view): the game screen's player card. */
export function PlayerBar({
  player,
  ms,
  active,
  offline,
  side,
  material,
}: {
  player: PlayerInfo | null;
  ms: number | null;
  active: boolean;
  offline?: boolean;
  /** This player's colour; with `material`, shows the pieces they have taken. */
  side?: Color;
  material?: MaterialBalance;
}) {
  return <PlayerCard player={player} ms={ms} active={active} offline={offline} material={side && material ? { ...material[side], color: opposite(side) } : undefined} />;
}

/**
 * The current time, refreshed every 100 ms while `running`, so clocks tick.
 * Use the returned value in the time calculation: with the React Compiler, a
 * value computed from Date.now() without it is cached until its other inputs
 * change, which froze spectator clocks until the next move.
 */
export function useTicker(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  return running ? now : Date.now();
}
