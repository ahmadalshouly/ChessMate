import {
  PROTOCOL_VERSION,
  decodeServer,
  encode,
  type ClientMessage,
  type ErrorCode,
  type PositionAnalysis,
} from '@chessmate/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SERVER_URL } from './config';

export interface EngineState {
  connected: boolean;
  /** Latest analysis for the most recent request. */
  analysis: PositionAnalysis | null;
  analyzing: boolean;
  error: { code: ErrorCode; message: string } | null;
}

const initial: EngineState = { connected: false, analysis: null, analyzing: false, error: null };

/**
 * Talks to the server-side engine over the game socket, for the analysis
 * board; the server refuses requests while you have a live game. Game reviews
 * never use it: they run on the device (features/engine).
 */
export function useEngine(token?: string) {
  const [state, setState] = useState<EngineState>(initial);
  const ws = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const nextId = useRef(1);
  const analysisId = useRef(0);
  /** Request to (re)send once the socket says welcome. */
  const pending = useRef<ClientMessage | null>(null);
  const [identity] = useState(() => token ?? `guest:Analyst${Math.floor(Math.random() * 9000 + 1000)}`);

  const send = useCallback((m: ClientMessage) => {
    if (ready.current && ws.current?.readyState === WebSocket.OPEN) ws.current.send(encode(m));
    else pending.current = m;
  }, []);

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const sock = new WebSocket(SERVER_URL);
      ws.current = sock;
      sock.onopen = () => sock.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token: identity }));
      sock.onmessage = (ev) => {
        const m = decodeServer(String(ev.data));
        if (!m) return;
        switch (m.t) {
          case 'welcome':
            retry = 0;
            ready.current = true;
            setState((s) => ({ ...s, connected: true }));
            if (pending.current) {
              sock.send(encode(pending.current));
              pending.current = null;
            }
            return;
          case 'analysis':
            if (m.id !== analysisId.current) return;
            return setState((s) => ({ ...s, analysis: m.analysis, analyzing: !m.done, error: null }));
          case 'error':
            if (m.id !== undefined && m.id !== analysisId.current) return;
            return setState((s) => ({ ...s, analyzing: false, error: { code: m.code, message: m.message } }));
          default:
            return;
        }
      };
      sock.onclose = () => {
        ready.current = false;
        if (closed) return;
        setState((s) => ({ ...s, connected: false, analyzing: false }));
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [identity]);

  const analyze = useCallback(
    (fen: string, multipv = 1, limits: { depth?: number; movetimeMs?: number } = {}) => {
      const id = nextId.current++;
      analysisId.current = id;
      setState((s) => ({ ...s, analyzing: true, analysis: s.analysis?.fen === fen ? s.analysis : null }));
      send({ t: 'analyze', id, fen, multipv, ...limits });
    },
    [send],
  );

  const stop = useCallback(() => {
    if (analysisId.current) send({ t: 'analyzeStop', id: analysisId.current });
    analysisId.current = 0;
    setState((s) => ({ ...s, analyzing: false }));
  }, [send]);

  return { state, analyze, stop };
}
