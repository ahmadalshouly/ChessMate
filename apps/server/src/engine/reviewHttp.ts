import { Game, type PositionEval } from '@chessmate/core';

import { readJson } from '../auth/http';
import type { HttpRoute, ResolveUser } from '../social/http';
import type { AnalysisService } from './analysisService';
import { EngineBusyError } from './pool';

export interface ReviewEvalDeps {
  /** The server's engines, or null when this server runs none. */
  analysis: AnalysisService | null | undefined;
  resolveUser: ResolveUser;
  /** True while this player has a live game: engine help is off then. */
  inLiveGame: (userId: string) => boolean;
  /** True for a position that is on the board in a live game right now. */
  isLivePosition: (fen: string) => boolean;
}

/** Positions per request. The app sends one or two at a time so its progress moves steadily. */
export const MAX_REVIEW_BATCH = 8;
/** Requests one player may have running at once. */
const MAX_IN_FLIGHT = 4;
/** Search limits accepted from the app (it asks for what its own engine would search). */
const DEPTH = { min: 8, max: 18, default: 12 };
const MOVETIME = { min: 300, max: 3000, default: 1500 };

/**
 * Server fallback for game review, for devices that can't run the engine
 * themselves (or whose engine stalls):
 *
 *   POST /api/review/evaluate  { fens: string[], depth?, movetimeMs? }  → { evals: PositionEval[] }
 *
 * The app grades the moves from these results with the same code it uses for
 * its own engine, so a review looks the same wherever it was searched. Signed
 * in only, never during a live game or for a position being played live, and
 * a few requests at a time per player.
 */
export function reviewEvalRoutes(deps: ReviewEvalDeps): HttpRoute {
  const inFlight = new Map<string, number>();
  return async (req, res, url) => {
    if (url.pathname !== '/api/review/evaluate') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const viewer = token ? await deps.resolveUser(token) : null;
    if (!viewer) return json(401, { error: 'Sign in to review games' });
    const analysis = deps.analysis;
    if (!analysis) return json(503, { error: 'Engine analysis is not running on this server' });
    if (deps.inLiveGame(viewer)) return json(423, { error: 'Engine analysis is disabled during live games' });

    let body: Record<string, unknown>;
    try {
      body = await readJson(req, 16 * 1024);
    } catch (e) {
      return json(400, { error: e instanceof Error ? e.message : 'Invalid body' });
    }
    const raw = body.fens;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_REVIEW_BATCH) return json(400, { error: `Send 1 to ${MAX_REVIEW_BATCH} positions` });
    const fens: string[] = [];
    for (const f of raw) {
      if (typeof f !== 'string' || f.length > 120) return json(400, { error: 'Invalid position' });
      try {
        fens.push(new Game(f).fen);
      } catch {
        return json(400, { error: 'Invalid position' });
      }
    }
    if (fens.some((f) => deps.isLivePosition(f))) return json(423, { error: 'Engine analysis is disabled during live games' });
    const depth = clampInt(body.depth, DEPTH);
    const movetimeMs = clampInt(body.movetimeMs, MOVETIME);

    const running = inFlight.get(viewer) ?? 0;
    if (running >= MAX_IN_FLIGHT) return json(429, { error: 'Too many review requests at once' });
    inFlight.set(viewer, running + 1);
    // Stop searching if the app goes away (review closed).
    const ctrl = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ctrl.abort();
    });
    try {
      const evals: PositionEval[] = [];
      for (const fen of fens) evals.push(await analysis.evaluate(fen, { depth, movetimeMs, signal: ctrl.signal, priority: 'normal' }));
      return json(200, { evals });
    } catch (e) {
      if (ctrl.signal.aborted) return true;
      if (e instanceof EngineBusyError) return json(429, { error: e.message });
      return json(503, { error: e instanceof Error ? `Engine unavailable: ${e.message}` : 'Engine unavailable' });
    } finally {
      const n = (inFlight.get(viewer) ?? 1) - 1;
      if (n > 0) inFlight.set(viewer, n);
      else inFlight.delete(viewer);
    }
  };
}

function clampInt(v: unknown, r: { min: number; max: number; default: number }): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : r.default;
  return Math.min(r.max, Math.max(r.min, n));
}
