import { Game, positionEvalFrom, positionKey, terminalState, type Score } from '@chessmate/core';
import { useEffect, useMemo, useState } from 'react';

import { AbortError, localEngine } from '@/features/engine/localEngine';

/** Search depth for each listed move: quick (tens of milliseconds a move on a laptop), and plenty to rank opening moves. */
export const EXPLORER_EVAL_DEPTH = 12;
const MOVETIME_MS = 900;
/** Evaluations of positions already searched, so stepping back is instant. */
const cache = new Map<string, Score>();
const MAX_CACHE = 3_000;

function remember(key: string, score: Score) {
  cache.delete(key);
  cache.set(key, score);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
}

/** A searched or finished position's score, if known. Mate or stalemate on the board needs no search. */
function known(fen: string): Score | undefined {
  return cache.get(positionKey(fen)) ?? (terminalState(fen) ? positionEvalFrom(fen, null).score : undefined);
}

/** True when this device can run the engine for the eval column. */
export function moveEvalsAvailable(): boolean {
  return localEngine.usable;
}

/**
 * Engine evaluation (White's view) of the position after each of these moves,
 * searched on this device so the explorer costs the server nothing. Fills in
 * as results come; stops when the position or the moves change.
 */
export function useMoveEvals(fen: string, moves: string[], enabled: boolean): Map<string, Score> {
  const list = moves.join(',');
  /** Bumped when a search finishes, to read the cache again. */
  const [version, setVersion] = useState(0);
  const after = useMemo(() => {
    const out = new Map<string, string>();
    for (const uci of list ? list.split(',') : []) {
      const g = new Game(fen);
      if (g.move(uci)) out.set(uci, g.fen);
    }
    return out;
  }, [fen, list]);

  useEffect(() => {
    if (!enabled || !localEngine.usable) return;
    const ctrl = new AbortController();
    for (const f of after.values()) {
      if (known(f)) continue;
      localEngine
        .search(f, { depth: EXPLORER_EVAL_DEPTH, multipv: 1, movetimeMs: MOVETIME_MS, urgent: true, signal: ctrl.signal })
        .then((res) => {
          remember(positionKey(f), positionEvalFrom(f, res.lines.get(1) ?? null, res.bestMove ?? undefined).score);
          if (!ctrl.signal.aborted) setVersion((v) => v + 1);
        })
        .catch((e: unknown) => {
          // Aborted (position changed) or the engine failed: the cell stays empty.
          if (!(e instanceof AbortError)) console.warn('Dig Deep eval failed', e);
        });
    }
    return () => ctrl.abort();
  }, [after, enabled]);

  return useMemo(() => {
    void version;
    const out = new Map<string, Score>();
    for (const [uci, f] of after) {
      const s = known(f);
      if (s) out.set(uci, s);
    }
    return out;
  }, [after, version]);
}
