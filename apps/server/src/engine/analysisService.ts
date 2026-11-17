import {
  ANALYSIS_LIMITS,
  Game,
  buildReview,
  lineFromInfo,
  positionEvalFrom,
  terminalScore,
  terminalState,
  type EngineLine,
  type GameReview,
  type PositionAnalysis,
  type PositionEval,
  type ServerMessage,
  type UciInfo,
} from '@chessmate/core';
import type { EnginePool } from './pool';

export interface AnalysisServiceOptions {
  /** Engine settings for game reviews (per position). */
  reviewDepth?: number;
  reviewMoveTimeMs?: number;
  /** Minimum gap between streamed analysis updates. */
  updateIntervalMs?: number;
}

export type Send = (msg: ServerMessage) => void;

interface Client {
  analysis?: { id: number; ctrl: AbortController };
  review?: { id: number; ctrl: AbortController };
}

/**
 * Turns engine output into protocol messages: live analysis for the analysis
 * board and full reviews of finished games. The caller (game server) decides
 * who may use it; this class only runs and cancels searches.
 */
export class AnalysisService {
  private clients = new Map<string, Client>();
  private reviewCache = new Map<string, GameReview>();

  constructor(
    private readonly pool: EnginePool,
    private readonly opts: AnalysisServiceOptions = {},
  ) {}

  private client(key: string): Client {
    let c = this.clients.get(key);
    if (!c) this.clients.set(key, (c = {}));
    return c;
  }

  /** Streams analysis of one position. A new request from the same client replaces the old one. */
  async analyze(key: string, req: { id: number; fen: string; multipv?: number; depth?: number }, send: Send): Promise<void> {
    const c = this.client(key);
    c.analysis?.ctrl.abort();
    let fen: string;
    try {
      fen = new Game(req.fen).fen;
    } catch {
      return send({ t: 'error', code: 'bad_request', message: 'Invalid position', id: req.id });
    }
    const terminal = terminalState(fen);
    if (terminal) {
      const analysis: PositionAnalysis = { fen, depth: 0, lines: [], terminal };
      return send({ t: 'analysis', id: req.id, analysis, done: true });
    }
    const multipv = clamp(Math.round(req.multipv ?? 1), 1, ANALYSIS_LIMITS.maxMultiPv);
    const depth = clamp(Math.round(req.depth ?? ANALYSIS_LIMITS.defaultDepth), 1, ANALYSIS_LIMITS.maxDepth);
    const ctrl = new AbortController();
    const entry = { id: req.id, ctrl };
    c.analysis = entry;

    const interval = this.opts.updateIntervalMs ?? 200;
    let lastSent = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const lines = new Map<number, EngineLine>();
    const snapshot = (): PositionAnalysis => {
      const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
      return { fen, depth: sorted[0]?.depth ?? 0, lines: sorted };
    };
    const flush = () => {
      pending = null;
      if (ctrl.signal.aborted || lines.size === 0) return;
      lastSent = Date.now();
      send({ t: 'analysis', id: req.id, analysis: snapshot(), done: false });
    };
    const onInfo = (info: UciInfo) => {
      const line = lineFromInfo(fen, info);
      if (!line) return;
      lines.set(line.multipv, line);
      if (pending) return;
      const wait = Math.max(0, interval - (Date.now() - lastSent));
      pending = setTimeout(flush, wait);
    };

    try {
      await this.pool.run(
        (engine) => engine.search(fen, { multipv, depth, movetimeMs: ANALYSIS_LIMITS.maxMoveTimeMs }, onInfo, ctrl.signal),
        ctrl.signal,
      );
      if (pending) clearTimeout(pending);
      if (!ctrl.signal.aborted) send({ t: 'analysis', id: req.id, analysis: snapshot(), done: true });
    } catch (err) {
      if (pending) clearTimeout(pending);
      if (!ctrl.signal.aborted) send(engineError(err, req.id));
    } finally {
      if (c.analysis === entry) c.analysis = undefined;
    }
  }

  stop(key: string, id?: number) {
    const c = this.clients.get(key);
    if (c?.analysis && (id === undefined || c.analysis.id === id)) c.analysis.ctrl.abort();
  }

  /** Reviews a whole game, reporting progress, then sends per-move classifications. */
  async review(key: string, req: { id: number; moves: string[]; initialFen: string }, send: Send): Promise<GameReview | null> {
    const c = this.client(key);
    c.review?.ctrl.abort();
    if (req.moves.length > ANALYSIS_LIMITS.maxReviewPlies) {
      send({ t: 'error', code: 'bad_request', message: 'Game too long to review', id: req.id });
      return null;
    }
    // Validate the move list and collect every position.
    let fens: string[];
    try {
      const g = new Game(req.initialFen);
      fens = [g.fen];
      for (const m of req.moves) {
        if (!g.move(m)) throw new Error('illegal');
        fens.push(g.fen);
      }
    } catch {
      send({ t: 'error', code: 'bad_request', message: 'Invalid move list', id: req.id });
      return null;
    }
    const cacheKey = `${fens[0]}|${req.moves.join(' ')}`;
    const cached = this.reviewCache.get(cacheKey);
    if (cached) {
      send({ t: 'reviewResult', id: req.id, review: cached });
      return cached;
    }

    const ctrl = new AbortController();
    const entry = { id: req.id, ctrl };
    c.review = entry;
    const depth = this.opts.reviewDepth ?? REVIEW_DEFAULTS.depth;
    const movetimeMs = this.opts.reviewMoveTimeMs ?? REVIEW_DEFAULTS.movetimeMs;
    try {
      // Two lines per position: the second tells "the only good move" (!) apart from an easy one.
      // Positions are independent, so they spread across every engine in the pool.
      const evals: PositionEval[] = new Array(fens.length);
      let done = 0;
      let next = 0;
      const worker = async () => {
        while (next < fens.length && !ctrl.signal.aborted) {
          const i = next++;
          const fen = fens[i]!;
          const term = terminalState(fen);
          if (term) {
            evals[i] = { score: terminalScore(fen, term), pv: [], depth: 0 };
          } else {
            const res = await this.pool.run(
              (engine) => engine.search(fen, { multipv: REVIEW_DEFAULTS.multipv, depth, movetimeMs }, undefined, ctrl.signal),
              ctrl.signal,
            );
            evals[i] = positionEvalFrom(fen, res.lines.get(1) ?? null, res.bestMove ?? undefined, res.lines.get(2) ?? null);
          }
          if (ctrl.signal.aborted) return;
          send({ t: 'reviewProgress', id: req.id, done: ++done, total: fens.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(this.pool.size, fens.length) }, worker));
      if (ctrl.signal.aborted) return null;
      const review = buildReview(fens[0]!, req.moves, evals);
      this.remember(cacheKey, review);
      send({ t: 'reviewResult', id: req.id, review });
      return review;
    } catch (err) {
      if (!ctrl.signal.aborted) send(engineError(err, req.id));
      return null;
    } finally {
      if (c.review === entry) c.review = undefined;
    }
  }

  /** Cancels everything a client is running (disconnect, or a live game started). */
  cancel(key: string) {
    const c = this.clients.get(key);
    if (!c) return;
    c.analysis?.ctrl.abort();
    c.review?.ctrl.abort();
    this.clients.delete(key);
  }

  close() {
    for (const key of [...this.clients.keys()]) this.cancel(key);
    this.pool.close();
  }

  private remember(key: string, review: GameReview) {
    this.reviewCache.set(key, review);
    if (this.reviewCache.size > 200) this.reviewCache.delete(this.reviewCache.keys().next().value!);
  }
}

/** Per-position search for game reviews. REVIEW_DEPTH and REVIEW_MOVETIME_MS override. */
export const REVIEW_DEFAULTS = { depth: 18, movetimeMs: 800, multipv: 2 } as const;

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function engineError(err: unknown, id: number): ServerMessage {
  const message = err instanceof Error ? err.message : 'Engine error';
  return { t: 'error', code: 'engine_unavailable', message: `Engine unavailable: ${message}`, id };
}
