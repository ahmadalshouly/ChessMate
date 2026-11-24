import { Game, type AdminFairPlayGame, type Score } from '@chessmate/core';
import { useCallback, useRef, useState } from 'react';

import { localEngine } from '@/features/engine/localEngine';

import type { AdminApi } from '@/lib/adminApi';

/**
 * Engine analysis of a fair-play case, run on the moderator's own device.
 *
 * The server's Stockfish is the normal source of fair-play evidence; on a
 * server with no engine (`STOCKFISH_PATH` unset) nothing is ever analysed and
 * a case stays empty. This fills that gap with the engine the app already
 * carries: the moderator's device evaluates every position of the player's
 * recent rated games and sends the raw results back, and the server checks
 * them against the stored game and computes the accuracy, match rate and
 * z-scores itself.
 *
 * It is deliberately staff-only. Evidence about a suspected cheater must not
 * come from that player's own device: the one number that matters is how far
 * their accuracy sits above their rating, which is exactly what a dishonest
 * client would shade. Reports made this way are stored as `device`, shown as
 * such, and never open a case on their own.
 */

/** Search depth per position: the same as the server's FAIRPLAY_ENGINE_DEPTH default, so evidence is comparable. */
export const CASE_DEPTH = 14;
/** Hard cap per position, so one sharp position can't stall a run. */
const MOVETIME_MS = 4000;
/** Games analysed in one run by default. */
export const CASE_GAMES = 5;

/** What the last run came to, so a run that does nothing visible still says why. */
export type CaseAnalysisOutcome =
  | { kind: 'none'; found: number }
  | { kind: 'done'; analyzed: number }
  | { kind: 'cancelled'; analyzed: number }
  | { kind: 'failed'; analyzed: number; message: string };

export interface CaseAnalysisState {
  running: boolean;
  /** Games finished so far in this run, and how many it is doing. */
  games: { done: number; total: number };
  /** Positions searched in the game being analysed. */
  positions: { done: number; total: number };
  error: string | null;
  /** Games whose reports the server accepted. */
  analyzed: number;
  /** How the last run ended; null before the first one. */
  outcome: CaseAnalysisOutcome | null;
  run: () => void;
  cancel: () => void;
}

/** True where this device can run Stockfish at all. */
export const canAnalyzeHere = () => localEngine.usable;

export function useCaseAnalysis(api: AdminApi, playerId: string, onDone: () => void): CaseAnalysisState {
  const [running, setRunning] = useState(false);
  const [games, setGames] = useState({ done: 0, total: 0 });
  const [positions, setPositions] = useState({ done: 0, total: 0 });
  const [analyzed, setAnalyzed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CaseAnalysisOutcome | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const cancel = useCallback(() => ctrl.current?.abort(), []);

  const run = useCallback(() => {
    if (ctrl.current) return;
    const c = new AbortController();
    ctrl.current = c;
    setRunning(true);
    setError(null);
    setOutcome(null);
    setAnalyzed(0);
    setGames({ done: 0, total: 0 });
    setPositions({ done: 0, total: 0 });
    void (async () => {
      let ok = 0;
      try {
        const found = await api.fairPlayGames(playerId, CASE_GAMES);
        const pending = found.filter((g) => !g.analyzed);
        setGames({ done: 0, total: pending.length });
        // Nothing to do is the easiest run to mistake for a broken button, so say so.
        if (pending.length === 0) return setOutcome({ kind: 'none', found: found.length });
        localEngine.warmUp();
        for (const [i, g] of pending.entries()) {
          if (c.signal.aborted) break;
          const evals = await analyzeGame(g, c.signal, (done, total) => setPositions({ done, total }));
          if (c.signal.aborted) break;
          await api.submitFairPlayAnalysis(playerId, g.gameId, CASE_DEPTH, evals);
          ok++;
          setAnalyzed(ok);
          setGames({ done: i + 1, total: pending.length });
        }
        setOutcome(c.signal.aborted ? { kind: 'cancelled', analyzed: ok } : { kind: 'done', analyzed: ok });
      } catch (e) {
        if (c.signal.aborted) setOutcome({ kind: 'cancelled', analyzed: ok });
        else {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          setOutcome({ kind: 'failed', analyzed: ok, message });
        }
      } finally {
        ctrl.current = null;
        setRunning(false);
        if (ok > 0) onDone();
      }
    })();
  }, [api, playerId, onDone]);

  return { running, games, positions, error, analyzed, outcome, run, cancel };
}

/** One evaluation per position of the game, in the shape the server expects. */
export async function analyzeGame(
  g: AdminFairPlayGame,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<{ score: Score; bestMove: string | null }[]> {
  // Walk the game once to get every position, and stop at a position the game
  // ended in (the server scores those from the board and ignores what we send).
  const board = new Game(g.initialFen);
  const positions: { fen: string; terminal: boolean }[] = [];
  for (let i = 0; i <= g.moves.length; i++) {
    positions.push({ fen: board.fen, terminal: !!board.boardOutcome() });
    const uci = g.moves[i];
    if (uci === undefined) break;
    if (!board.move(uci)) throw new Error(`Illegal move in stored game ${g.gameId}`);
  }

  const total = positions.length;
  const out: { score: Score; bestMove: string | null }[] = new Array<{ score: Score; bestMove: string | null }>(total);
  let done = 0;
  onProgress(0, total);

  // One lane per engine, each taking a consecutive stretch of the game, so an
  // engine reuses what it learned on the position before (see farmSource.ts).
  const lanes = Math.max(1, await localEngine.engines());
  const per = Math.ceil(total / lanes);
  await Promise.all(
    Array.from({ length: lanes }, async (_, lane) => {
      for (let i = lane * per; i < Math.min(total, (lane + 1) * per); i++) {
        if (signal.aborted) throw new Error('Cancelled');
        const p = positions[i]!;
        if (p.terminal) out[i] = { score: { cp: 0 }, bestMove: null };
        else {
          const r = await localEngine.search(p.fen, {
            depth: CASE_DEPTH,
            multipv: 1,
            movetimeMs: MOVETIME_MS,
            history: { start: g.initialFen, moves: g.moves.slice(0, i) },
            lane,
            signal,
          });
          out[i] = { score: r.lines.get(1)?.score ?? { cp: 0 }, bestMove: r.bestMove };
        }
        onProgress(++done, total);
      }
    }),
  );
  return out;
}
