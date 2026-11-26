import { opposite, type Color, type MaterialBalance, type PlayerInfo } from '@chessmate/core';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

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
export function useTicker(running: boolean, everyMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      setNow(Date.now());
      id ??= setInterval(() => setNow(Date.now()), everyMs);
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    // Nothing to tick for while the app is in the background: stop, and catch up on return.
    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (st) => (st === 'active' ? start() : st === 'background' && stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [running, everyMs]);
  return running ? now : Date.now();
}
