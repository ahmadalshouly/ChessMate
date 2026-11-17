import type { Color, CoachChatRequest, GameAnalysis, GameAnalyzer } from '@chessmate/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CoachInputError, type CoachService } from './coachService';
import { LlmError } from './llm';

export interface CoachHttpOptions {
  service: CoachService;
  /** Resolves a bearer token to a player id, or null when unauthorised. */
  authorize: (token: string) => string | null;
  /** Engine service; lets clients send just the moves of a game. */
  analyzer?: GameAnalyzer;
  /** Requests per player per hour. */
  reviewsPerHour?: number;
  chatsPerHour?: number;
  now?: () => number;
}

const MAX_BODY = 512 * 1024;

/**
 * HTTP routes for the coach:
 *   GET  /coach/status   -> { ai: boolean }
 *   POST /coach/review   { analysis: GameAnalysis, perspective: "w"|"b" }
 *                     or { game: { uciMoves, white, black, result? }, perspective }  (needs an analyzer)
 *   POST /coach/chat     CoachChatRequest
 * Returns true when the request was handled.
 */
export function createCoachHttpHandler(opts: CoachHttpOptions) {
  const limiter = new RateLimiter(opts.now ?? Date.now);

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = (req.url ?? '').split('?')[0]!;
    if (!url.startsWith('/coach/')) return false;
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    if (url === '/coach/status' && req.method === 'GET') {
      json(res, 200, { ai: opts.service.aiEnabled, analyzer: !!opts.analyzer });
      return true;
    }
    if (req.method !== 'POST' || (url !== '/coach/review' && url !== '/coach/chat')) {
      json(res, 404, { error: 'not_found' });
      return true;
    }
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const playerId = token ? opts.authorize(token) : null;
    if (!playerId) {
      json(res, 401, { error: 'unauthorized' });
      return true;
    }
    const isReview = url === '/coach/review';
    const limit = isReview ? (opts.reviewsPerHour ?? 30) : (opts.chatsPerHour ?? 120);
    if (!limiter.take(`${url}:${playerId}`, limit)) {
      json(res, 429, { error: 'rate_limited', message: 'Too many coach requests, try again later' });
      return true;
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      json(res, 400, { error: 'bad_request', message: 'Body must be JSON under 512 KB' });
      return true;
    }
    try {
      if (isReview) {
        const b = body as { analysis?: GameAnalysis; game?: Parameters<GameAnalyzer['analyzeGame']>[0]; perspective?: Color; language?: unknown };
        let analysis = b.analysis;
        if (!analysis && b.game) {
          if (!opts.analyzer) throw new CoachInputError('Engine analysis is not available on this server; send "analysis"');
          analysis = await opts.analyzer.analyzeGame(b.game);
        }
        if (!analysis) throw new CoachInputError('Send "analysis" (or "game" when the engine is available)');
        json(res, 200, await opts.service.review(analysis, b.perspective as Color, typeof b.language === 'string' ? b.language : undefined));
      } else {
        json(res, 200, await opts.service.chat(body as CoachChatRequest));
      }
    } catch (e) {
      if (e instanceof CoachInputError) json(res, 400, { error: 'bad_request', message: e.message });
      else if (e instanceof LlmError) json(res, e.retryable ? 503 : 502, { error: 'coach_unavailable', message: e.message });
      else json(res, 500, { error: 'internal', message: 'Coach failed' });
    }
    return true;
  };
}

function cors(res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
}

function json(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Sliding one-hour window per key. In-memory; move to Redis when scaling out. */
class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly now: () => number) {}
  take(key: string, limit: number): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < 3600_000);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}
