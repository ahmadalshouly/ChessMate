import {
  Game,
  publicHistory,
  publicMove,
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
import { freshSocialToken, getSocialIdentity } from './session';
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
  const secret = useRef(false);

  useEffect(() => {
    const guest = `guest:Spectator${Math.floor(Math.random() * 9000 + 1000)}`;
    const ws = new WebSocket(SERVER_URL);
    ws.onopen = () => {
      const signedIn = !!getSocialIdentity();
      void (signedIn ? freshSocialToken() : Promise.resolve(null)).then((token) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token: token ?? guest }));
      });
    };
    ws.onmessage = (ev) => {
      const m = decodeServer(String(ev.data));
      if (!m) return;
      switch (m.t) {
        case 'welcome':
          return ws.send(encode({ t: 'watch', gameId }));
        case 'gameState':
        case 'gameStart': {
          const s = m.game;
          // Secret Queen: pawns may have moved like queens, so take the server's public positions as they are.
          secret.current = s.variant === 'secretQueen';
          let history: PlayedMove[];
          if (secret.current) {
            game.current = new Game(s.fen ?? s.initialFen);
            history = publicHistory(s.positions ?? [], s.initialFen);
          } else {
            try {
              game.current = Game.fromUciMoves(s.moves, s.initialFen);
            } catch {
              // Never crash on a snapshot we cannot replay: show the position without the move list.
              game.current = new Game(s.fen ?? s.initialFen);
            }
            history = game.current.history();
          }
          return setState((p) => ({
            ...p,
            status: s.outcome ? 'finished' : 'live',
            white: s.white,
            black: s.black,
            clock: s.clock,
            clockOffset: s.serverNow - Date.now(),
            outcome: s.outcome,
            fen: game.current.fen,
            history,
          }));
        }
        case 'moved': {
          if (secret.current && m.fen) {
            const fen = m.fen;
            game.current = new Game(fen);
            return setState((p) => {
              if (p.history.length !== m.ply - 1) return p;
              const before = p.history[p.history.length - 1]?.fenAfter ?? p.fen;
              return { ...p, clock: m.clock, clockOffset: m.serverNow - Date.now(), fen, history: [...p.history, publicMove({ uci: m.uci, san: m.san, fen }, before)] };
            });
          }
          const g = game.current;
          if (g.ply === m.ply - 1) {
            if (!g.move(m.uci)) return ws.send(encode({ t: 'watch', gameId }));
          } else if (g.ply !== m.ply) return ws.send(encode({ t: 'watch', gameId }));
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
