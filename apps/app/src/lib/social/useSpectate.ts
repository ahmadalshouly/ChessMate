import {
  Game,
  PROTOCOL_VERSION,
  decodeServer,
  encode,
  type ClockState,
  type GameOutcome,
  type PlayedMove,
  type PlayerInfo,
} from '@chessmate/core';
import { useEffect, useRef, useState } from 'react';

import { SERVER_URL } from '@/lib/config';
import { getSocialIdentity } from './session';
import { translate } from '@/i18n';

export interface SpectateState {
  status: 'connecting' | 'live' | 'finished' | 'error';
  error: string | null;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  fen: string;
  history: PlayedMove[];
  clock: ClockState | null;
  clockOffset: number;
  outcome: GameOutcome | null;
  spectators: number;
}

/** Read-only mirror of a live game. Guests can watch too. */
export function useSpectate(gameId: string) {
  const [state, setState] = useState<SpectateState>({
    status: 'connecting',
    error: null,
    white: null,
    black: null,
    fen: new Game().fen,
    history: [],
    clock: null,
    clockOffset: 0,
    outcome: null,
    spectators: 0,
  });
  const game = useRef(new Game());

  useEffect(() => {
    const token = getSocialIdentity()?.token ?? `guest:Spectator${Math.floor(Math.random() * 9000 + 1000)}`;
    const ws = new WebSocket(SERVER_URL);
    ws.onopen = () => ws.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token }));
    ws.onmessage = (ev) => {
      const m = decodeServer(String(ev.data));
      if (!m) return;
      switch (m.t) {
        case 'welcome':
          return ws.send(encode({ t: 'watch', gameId }));
        case 'gameState':
        case 'gameStart': {
          const s = m.game;
          game.current = Game.fromUciMoves(s.moves, s.initialFen);
          return setState((p) => ({
            ...p,
            status: s.outcome ? 'finished' : 'live',
            white: s.white,
            black: s.black,
            clock: s.clock,
            clockOffset: s.serverNow - Date.now(),
            outcome: s.outcome,
            fen: game.current.fen,
            history: game.current.history(),
          }));
        }
        case 'moved': {
          const g = game.current;
          if (g.ply === m.ply - 1) g.move(m.uci);
          else if (g.ply !== m.ply) return ws.send(encode({ t: 'watch', gameId }));
          return setState((p) => ({ ...p, clock: m.clock, clockOffset: m.serverNow - Date.now(), fen: g.fen, history: g.history() }));
        }
        case 'gameOver':
          return setState((p) => ({ ...p, status: 'finished', outcome: m.outcome, clock: p.clock && { ...p.clock, running: null } }));
        case 'watching':
          return setState((p) => ({ ...p, spectators: m.spectators }));
        case 'error':
          return setState((p) => ({ ...p, status: p.white ? p.status : 'error', error: m.message }));
      }
    };
    ws.onerror = () => setState((p) => ({ ...p, status: p.white ? p.status : 'error', error: translate('puzzles.home.unreachable') }));
    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encode({ t: 'unwatch', gameId }));
      ws.close();
    };
  }, [gameId]);

  return state;
}
