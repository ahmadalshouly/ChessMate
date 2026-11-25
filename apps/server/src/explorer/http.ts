import { EXPLORER_MAX_PLY, EXPLORER_SOURCES, Game, START_FEN, parseExplorerFilters, type ExplorerSource } from '@chessmate/core';

import { RateLimiter } from '../auth/rateLimit';
import { clientIp } from '../clientIp';
import type { HttpRoute } from '../social/http';
import { ExplorerError, type ExplorerErrorCode } from './lichess';
import type { ExplorerService } from './service';

const STATUS: Record<ExplorerErrorCode, number> = { busy: 429, unauthorized: 503, unavailable: 503, not_configured: 503 };
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export interface ExplorerRouteOptions {
  now?: () => number;
  /** Lookups per IP per minute. */
  perMinute?: number;
}

/**
 * Dig Deep, the opening explorer. Public (the data is), limited per IP:
 *
 *   GET /api/explorer?source=lichess|masters|chessmate&fen=…[&speeds=blitz,rapid][&ratings=1600,1800]
 *       → { position: ExplorerPosition, stale: boolean }
 *   GET /api/explorer/theory?moves=e2e4,e7e5,…[&fen=<start>]
 *       → { plies }  how many opening moves are theory by the masters' games (Book in reviews)
 */
export function explorerRoutes(explorer: ExplorerService, opts: ExplorerRouteOptions = {}): HttpRoute {
  const now = opts.now ?? Date.now;
  const limiter = new RateLimiter(opts.perMinute ?? 180, 60_000);
  return async (req, res, url) => {
    if (url.pathname !== '/api/explorer' && url.pathname !== '/api/explorer/theory') return false;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    const json = (status: number, body: unknown, cache = 'no-store') => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache });
      res.end(JSON.stringify(body));
      return true as const;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'GET') return json(405, { error: 'GET only' });
    if (!limiter.take(`explorer:${clientIp(req)}`, now())) return json(429, { error: 'Too many lookups: slow down a little', code: 'busy' });
    const q = url.searchParams;

    try {
      if (url.pathname === '/api/explorer/theory') {
        const start = validFen(q.get('fen') ?? START_FEN);
        if (!start) return json(400, { error: 'Invalid position' });
        const moves = (q.get('moves') ?? '').split(',').filter(Boolean).slice(0, EXPLORER_MAX_PLY);
        if (!moves.every((m) => UCI.test(m))) return json(400, { error: 'Invalid moves' });
        const r = await explorer.theory(start, moves);
        // An answer cut short by a failed lookup must not be cached.
        return json(200, { plies: r.plies }, r.certain ? 'public, max-age=3600' : 'no-store');
      }

      const source = q.get('source') as ExplorerSource | null;
      if (!source || !EXPLORER_SOURCES.includes(source)) return json(400, { error: 'Unknown collection' });
      const fen = validFen(q.get('fen') ?? '');
      if (!fen) return json(400, { error: 'Invalid position' });
      const filters = parseExplorerFilters(q.get('speeds'), q.get('ratings'));
      const r = await explorer.position(source, fen, filters);
      // Short for our own games (they change), longer for Lichess (they don't, much).
      return json(200, r, r.stale ? 'no-store' : source === 'chessmate' ? 'public, max-age=60' : 'public, max-age=3600');
    } catch (e) {
      if (e instanceof ExplorerError) return json(STATUS[e.code], { error: e.message, code: e.code });
      throw e;
    }
  };
}

function validFen(fen: string): string | null {
  if (!fen || fen.length > 120) return null;
  try {
    return new Game(fen).fen;
  } catch {
    return null;
  }
}
