import {
  Game,
  PROTOCOL_VERSION,
  decodeServer,
  encode,
  remaining,
  type ClientMessage,
  type ClockState,
  type Color,
  type GameOutcome,
  type GameSnapshot,
  type PlayedMove,
  type PlayerInfo,
  type ServerMessage,
  type TimeControl,
} from '@chessmate/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SERVER_URL } from './config';

export type OnlineStatus = 'connecting' | 'idle' | 'seeking' | 'playing' | 'finished' | 'offline';

export interface OnlineState {
  status: OnlineStatus;
  me: PlayerInfo | null;
  gameId: string | null;
  you: Color;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  /** Immutable view of the board; the mutable Game stays inside the hook. */
  fen: string;
  history: PlayedMove[];
  clock: ClockState | null;
  /** Offset to convert local time to server time. */
  clockOffset: number;
  outcome: GameOutcome | null;
  drawOfferBy: Color | null;
  opponentConnected: boolean;
  error: string | null;
}

const initial: OnlineState = {
  status: 'connecting',
  me: null,
  gameId: null,
  you: 'w',
  white: null,
  black: null,
  fen: new Game().fen,
  history: [],
  clock: null,
  clockOffset: 0,
  outcome: null,
  drawOfferBy: null,
  opponentConnected: true,
  error: null,
};

/**
 * Connects to the game server and mirrors the authoritative game. Moves are
 * applied optimistically and re-synced from the server on rejection.
 */
export function useOnlineGame(token: string) {
  const [state, setState] = useState<OnlineState>(initial);
  const ws = useRef<WebSocket | null>(null);
  const game = useRef(new Game());
  const retry = useRef(0);
  /** Extra message listeners (chat, etc.) so features can live in their own hooks. */
  const listeners = useRef(new Set<(m: ServerMessage) => void>());
  const subscribe = useCallback((fn: (m: ServerMessage) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(encode(m));
  }, []);

  const loadSnapshot = useCallback((s: GameSnapshot, you?: Color) => {
    game.current = Game.fromUciMoves(s.moves, s.initialFen);
    setState((prev) => ({
      ...prev,
      status: s.outcome ? 'finished' : 'playing',
      gameId: s.gameId,
      you: you ?? prev.you,
      white: s.white,
      black: s.black,
      clock: s.clock,
      clockOffset: s.serverNow - Date.now(),
      outcome: s.outcome,
      drawOfferBy: s.drawOfferBy,
      fen: game.current.fen,
      history: game.current.history(),
    }));
  }, []);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const sock = new WebSocket(SERVER_URL);
      ws.current = sock;
      sock.onopen = () => {
        retry.current = 0;
        sock.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token }));
      };
      sock.onmessage = (ev) => {
        const m = decodeServer(String(ev.data));
        if (!m) return;
        for (const fn of listeners.current) fn(m);
        switch (m.t) {
          case 'welcome':
            return setState((p) => ({ ...p, me: m.player, status: p.gameId ? p.status : 'idle', error: null }));
          case 'seeking':
            return setState((p) => ({ ...p, status: 'seeking' }));
          case 'seekCancelled':
            return setState((p) => ({ ...p, status: 'idle' }));
          case 'gameStart':
            return loadSnapshot(m.game, m.you);
          case 'gameState':
            return loadSnapshot(m.game);
          case 'moved': {
            const g = game.current;
            if (g.ply === m.ply - 1) g.move(m.uci);
            else if (g.ply !== m.ply) return send({ t: 'join', gameId: m.gameId });
            return setState((p) => ({
              ...p,
              clock: m.clock,
              clockOffset: m.serverNow - Date.now(),
              drawOfferBy: null,
              fen: g.fen,
              history: g.history(),
            }));
          }
          case 'drawOffered':
            return setState((p) => ({ ...p, drawOfferBy: m.by }));
          case 'drawDeclined':
            return setState((p) => ({ ...p, drawOfferBy: null }));
          case 'opponentConnection':
            return setState((p) => ({ ...p, opponentConnected: m.connected }));
          case 'gameOver':
            return setState((p) => ({ ...p, status: 'finished', outcome: m.outcome, drawOfferBy: null }));
          case 'error':
            if (m.code === 'chat_restricted') return; // shown by the chat panel
            return setState((p) => ({ ...p, error: m.message }));
          default:
            return;
        }
      };
      sock.onclose = () => {
        if (closed) return;
        setState((p) => ({ ...p, status: p.status === 'playing' ? 'playing' : 'offline' }));
        const delay = Math.min(10_000, 500 * 2 ** retry.current++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [token, loadSnapshot, send]);

  const actions = {
    seek: (timeControl: TimeControl, rated = false) => send({ t: 'seek', timeControl, rated }),
    cancelSeek: () => send({ t: 'cancelSeek' }),
    move: (uci: string) => {
      const g = game.current;
      if (!state.gameId || state.status !== 'playing' || g.turn !== state.you) return false;
      const ply = g.ply;
      if (!g.move(uci)) return false;
      setState((p) => ({ ...p, fen: g.fen, history: g.history() }));
      send({ t: 'move', gameId: state.gameId, uci, ply });
      return true;
    },
    resign: () => state.gameId && send({ t: 'resign', gameId: state.gameId }),
    abort: () => state.gameId && send({ t: 'abort', gameId: state.gameId }),
    offerDraw: () => state.gameId && send({ t: 'offerDraw', gameId: state.gameId }),
    acceptDraw: () => state.gameId && send({ t: 'acceptDraw', gameId: state.gameId }),
    declineDraw: () => state.gameId && send({ t: 'declineDraw', gameId: state.gameId }),
    newGame: () => {
      game.current = new Game();
      setState((p) => ({ ...initial, me: p.me, status: 'idle' }));
    },
  };

  return { state, actions, send, subscribe };
}

/** Remaining time for a side, corrected for server clock offset. */
export function clockRemaining(clock: ClockState | null, color: Color, offset: number): number {
  if (!clock) return 0;
  return remaining(clock, color, Date.now() + offset);
}
