import {
  PROTOCOL_VERSION,
  decodeServer,
  encode,
  type ClientMessage,
  type ErrorCode,
  type GameReview,
  type PositionAnalysis,
} from '@chessmate/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SERVER_URL } from './config';

export interface EngineState {
  connected: boolean;
  /** Latest analysis for the most recent request. */
  analysis: PositionAnalysis | null;
  analyzing: boolean;
  review: GameReview | null;
  reviewProgress: { done: number; total: number } | null;
  error: { code: ErrorCode; message: string } | null;
}

const initial: EngineState = { connected: false, analysis: null, analyzing: false, review: null, reviewProgress: null, error: null };

/**
 * Talks to the server-side engine over the game socket; the server refuses
 * requests while you have a live game. Game reviews run on the device first
 * (features/engine) and only use this when the device can't.
 */
export function useEngine(token?: string) {
  const [state, setState] = useState<EngineState>(initial);
  const ws = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const nextId = useRef(1);
  const analysisId = useRef(0);
  const reviewId = useRef(0);
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
          case 'reviewProgress':
            if (m.id !== reviewId.current) return;
            return setState((s) => ({ ...s, reviewProgress: { done: m.done, total: m.total } }));
          case 'reviewResult':
            if (m.id !== reviewId.current) return;
            return setState((s) => ({ ...s, review: m.review, reviewProgress: null, error: null }));
          case 'error':
            if (m.id !== undefined && m.id !== analysisId.current && m.id !== reviewId.current) return;
            return setState((s) => ({ ...s, analyzing: false, reviewProgress: null, error: { code: m.code, message: m.message } }));
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

  /** `cachedOnly`: only fetch a review the server already finished (error `not_found` otherwise). */
  const review = useCallback(
    (req: { moves: string[]; initialFen?: string; gameId?: string }, opts: { cachedOnly?: boolean } = {}) => {
      const id = nextId.current++;
      reviewId.current = id;
      setState((s) => ({ ...s, review: null, reviewProgress: opts.cachedOnly ? null : { done: 0, total: req.moves.length + 1 }, error: null }));
      send({ t: 'review', id, ...req, ...(opts.cachedOnly ? { cachedOnly: true } : null) });
    },
    [send],
  );

  return { state, analyze, stop, review };
}

/**
 * Asks the server to grade a game that was played on the device (against the
 * computer or pass-and-play) as soon as it ends, so Review opens with every move
 * already graded. Fire and forget: failures only mean Review computes it later.
 */
export function prepareReview(moves: string[], initialFen?: string) {
  if (moves.length < 2) return;
  try {
    const sock = new WebSocket(SERVER_URL);
    const done = setTimeout(() => sock.close(), 10_000);
    sock.onopen = () => sock.send(encode({ t: 'hello', v: PROTOCOL_VERSION, token: `guest:Review${Math.floor(Math.random() * 9000 + 1000)}` }));
    sock.onmessage = (ev) => {
      if (decodeServer(String(ev.data))?.t !== 'welcome') return;
      sock.send(encode({ t: 'prepareReview', moves, initialFen }));
      clearTimeout(done);
      // Give the message time to leave before closing.
      setTimeout(() => sock.close(), 500);
    };
    sock.onerror = () => {};
  } catch {
    // No connection: Review will grade the game when it is opened.
  }
}
