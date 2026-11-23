import type { PositionEval } from '@chessmate/core';

import { ApiError, apiRequest } from '@/lib/social/api';

/**
 * The server's Stockfish, for reviews on devices that can't run their own
 * engine (or whose engine stalls). It answers with the same per-position
 * results the device engine gives, so the moves are graded by the same code.
 * See apps/server/src/engine/reviewHttp.ts.
 */
export async function evaluateOnServer(fens: string[], o: { depth: number; movetimeMs: number }): Promise<PositionEval[]> {
  const r = await apiRequest<{ evals: PositionEval[] }>('POST', '/api/review/evaluate', { fens, depth: o.depth, movetimeMs: o.movetimeMs });
  if (!Array.isArray(r.evals) || r.evals.length !== fens.length) throw new ApiError(500, 'Bad answer from the server');
  return r.evals;
}

/** Worth asking again later (busy, offline for a moment), as opposed to refused for good. */
export function isTransient(e: unknown): boolean {
  return e instanceof ApiError ? e.status === 0 || e.status === 429 || e.status >= 500 : true;
}
