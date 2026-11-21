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
import { createHash } from 'node:crypto';
import { EngineBusyError, type EnginePool } from './pool';

export interface AnalysisServiceOptions {
  /** Engine settings for game reviews (per position). */
  reviewDepth?: number;
  reviewMoveTimeMs?: number;
  /** Minimum gap between streamed analysis updates. */
  updateIntervalMs?: number;
  /** Where finished reviews are kept across restarts (the database). */
  store?: ReviewStore;
  /** Review finished online games in the background (default on). */
  precompute?: boolean;
  /** Analysis-board requests allowed to wait for an engine before "busy" (default 64). */
  maxAnalysisQueue?: number;
  log?: (msg: string) => void;
}

/** Persistent home for finished reviews, keyed by `reviewKey`. */
export interface ReviewStore {
  get(key: string): Promise<GameReview | undefined>;
  put(key: string, review: GameReview, gameId?: string): Promise<void>;
}

/** Content key of a review: the same start position and moves give the same review. */
export function reviewKey(initialFen: string, moves: string[]): string {
  return createHash('sha256').update(`${initialFen}|${moves.join(' ')}`).digest('hex');
}

interface ReviewJob {
  ctrl: AbortController;
  promise: Promise<GameReview | null>;
  /** Started when a game ended rather than by a player; it is not cancelled when they leave. */
  background: boolean;
  done: number;
  listeners: Set<(done: number, total: number) => void>;
  boost(): void;
}

/** Background reviews waiting their turn; more than this are dropped (players can still ask). */
const MAX_BACKGROUND_QUEUE = 100;

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
  /** Reviews being computed, by content key, so two requests share one run. */
  private jobs = new Map<string, ReviewJob>();
  private backgroundTail: Promise<void> = Promise.resolve();
  private backgroundQueued = 0;
  private closed = false;

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
  async analyze(key: string, req: { id: number; fen: string; multipv?: number; depth?: number; movetimeMs?: number }, send: Send): Promise<void> {
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
    const movetimeMs = clamp(Math.round(req.movetimeMs ?? ANALYSIS_LIMITS.maxMoveTimeMs), 500, ANALYSIS_LIMITS.maxMoveTimeMs);
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
        (engine) => engine.search(fen, { multipv, depth, movetimeMs }, onInfo, ctrl.signal),
        ctrl.signal,
        { priority: 'high', maxQueue: this.opts.maxAnalysisQueue ?? 64 },
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

  /**
   * Reviews a whole game, reporting progress, then sends per-move classifications.
   * A finished review is answered from memory or the review store; a review that is
   * already running (for example the one started when the game ended) is joined and
   * sped up instead of started again.
   */
  async review(key: string, req: { id: number; moves: string[]; initialFen: string; gameId?: string }, send: Send): Promise<GameReview | null> {
    const c = this.client(key);
    c.review?.ctrl.abort();
    const positions = this.positions(req.moves, req.initialFen);
    if ('error' in positions) {
      send({ t: 'error', code: 'bad_request', message: positions.error, id: req.id });
      return null;
    }
    const { fens, cacheKey } = positions;
    const ctrl = new AbortController();
    const entry = { id: req.id, ctrl };
    c.review = entry;
    const stored = await this.lookup(cacheKey);
    if (ctrl.signal.aborted) return null;
    if (stored) {
      if (c.review === entry) c.review = undefined;
      send({ t: 'reviewResult', id: req.id, review: stored });
      return stored;
    }
    const job = this.jobs.get(cacheKey) ?? this.startJob(cacheKey, fens, req.moves, { workers: this.pool.size, gameId: req.gameId });
    job.boost();
    const listener = (done: number, total: number) => {
      if (!ctrl.signal.aborted) send({ t: 'reviewProgress', id: req.id, done, total });
    };
    job.listeners.add(listener);
    if (job.done > 0) listener(job.done, fens.length);
    ctrl.signal.addEventListener(
      'abort',
      () => {
        job.listeners.delete(listener);
        // Nobody is waiting for a review the player asked for: stop it. Reviews started
        // when a game ended keep going so they are ready next time.
        if (!job.background && job.listeners.size === 0) job.ctrl.abort();
      },
      { once: true },
    );
    try {
      const review = await job.promise;
      if (ctrl.signal.aborted || !review) return null;
      send({ t: 'reviewResult', id: req.id, review });
      return review;
    } catch (err) {
      if (!ctrl.signal.aborted) send(engineError(err, req.id));
      return null;
    } finally {
      job.listeners.delete(listener);
      if (c.review === entry) c.review = undefined;
    }
  }

  /**
   * Queues a review of a finished game in the background, one game at a time on a
   * single engine, so tapping Review later only has to fetch it.
   */
  precompute(req: { gameId?: string; moves: string[]; initialFen: string }): Promise<void> {
    if (this.opts.precompute === false || req.moves.length < 2 || this.closed) return Promise.resolve();
    const positions = this.positions(req.moves, req.initialFen);
    if ('error' in positions) return Promise.resolve();
    if (this.backgroundQueued >= MAX_BACKGROUND_QUEUE) return Promise.resolve();
    this.backgroundQueued++;
    const run = async () => {
      this.backgroundQueued--;
      const { fens, cacheKey } = positions;
      if (this.closed || this.jobs.has(cacheKey) || (await this.lookup(cacheKey))) return;
      await this.startJob(cacheKey, fens, req.moves, { workers: 1, gameId: req.gameId, background: true }).promise;
    };
    this.backgroundTail = this.backgroundTail.then(run).catch((e) => this.log(`background review failed: ${e instanceof Error ? e.message : e}`));
    return this.backgroundTail;
  }

  /** Every position of a game, or why the move list is not usable. */
  private positions(moves: string[], initialFen: string): { fens: string[]; cacheKey: string } | { error: string } {
    if (moves.length > ANALYSIS_LIMITS.maxReviewPlies) return { error: 'Game too long to review' };
    try {
      const g = new Game(initialFen);
      const fens = [g.fen];
      for (const m of moves) {
        if (!g.move(m)) throw new Error('illegal');
        fens.push(g.fen);
      }
      return { fens, cacheKey: reviewKey(fens[0]!, moves) };
    } catch {
      return { error: 'Invalid move list' };
    }
  }

  /** A finished review from memory, then from the store. */
  private async lookup(cacheKey: string): Promise<GameReview | undefined> {
    const hit = this.reviewCache.get(cacheKey);
    if (hit) return hit;
    if (!this.opts.store) return undefined;
    try {
      const stored = await this.opts.store.get(cacheKey);
      if (stored) this.remember(cacheKey, stored);
      return stored;
    } catch (e) {
      this.log(`review lookup failed: ${e instanceof Error ? e.message : e}`);
      return undefined;
    }
  }

  /**
   * Runs Stockfish over every position. Positions are independent, so they spread
   * across up to `workers` engines; `boost` raises that to the whole pool.
   */
  private startJob(cacheKey: string, fens: string[], moves: string[], o: { workers: number; gameId?: string; background?: boolean }): ReviewJob {
    const ctrl = new AbortController();
    const depth = this.opts.reviewDepth ?? REVIEW_DEFAULTS.depth;
    const movetimeMs = this.opts.reviewMoveTimeMs ?? REVIEW_DEFAULTS.movetimeMs;
    const evals: PositionEval[] = new Array(fens.length);
    let next = 0;
    let running = 0;
    let finish!: (v: GameReview | null) => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise<GameReview | null>((res, rej) => ((finish = res), (fail = rej)));
    // Background reviews only use spare engine time until a player asks for this one.
    let urgent = !o.background;
    const job: ReviewJob = {
      ctrl,
      promise,
      background: !!o.background,
      done: 0,
      listeners: new Set(),
      boost: () => {
        // Someone is waiting for it now: it no longer yields to other reviews.
        urgent = true;
        while (running < this.pool.size && next < fens.length && !ctrl.signal.aborted) spawn();
      },
    };
    const worker = async () => {
      while (next < fens.length && !ctrl.signal.aborted) {
        const i = next++;
        const fen = fens[i]!;
        const term = terminalState(fen);
        if (term) {
          evals[i] = { score: terminalScore(fen, term), pv: [], depth: 0 };
        } else {
          // Two lines per position: the second tells "the only good move" (!) apart from an easy one.
          const res = await this.pool.run(
            (engine) => engine.search(fen, { multipv: REVIEW_DEFAULTS.multipv, depth, movetimeMs }, undefined, ctrl.signal),
            ctrl.signal,
            // A review someone is waiting for outranks one done just in case.
            { priority: urgent ? 'normal' : 'low' },
          );
          evals[i] = positionEvalFrom(fen, res.lines.get(1) ?? null, res.bestMove ?? undefined, res.lines.get(2) ?? null);
        }
        if (ctrl.signal.aborted) return;
        job.done++;
        for (const l of job.listeners) l(job.done, fens.length);
      }
    };
    const spawn = () => {
      running++;
      worker().then(
        () => {
          running--;
          if (job.done === fens.length) {
            const review = buildReview(fens[0]!, moves, evals);
            this.remember(cacheKey, review);
            this.opts.store?.put(cacheKey, review, o.gameId).catch((e) => this.log(`review save failed: ${e instanceof Error ? e.message : e}`));
            finish(review);
          } else if (running === 0) {
            finish(null);
          }
        },
        (err) => {
          running--;
          if (ctrl.signal.aborted) {
            if (running === 0) finish(null);
            return;
          }
          // One engine failed: stop the rest and report it.
          ctrl.abort();
          fail(err);
        },
      );
    };
    // Settle anyone waiting when the job is cancelled while its workers wait for an engine.
    ctrl.signal.addEventListener('abort', () => queueMicrotask(() => running === 0 && finish(null)), { once: true });
    promise.then(
      () => this.jobs.get(cacheKey) === job && this.jobs.delete(cacheKey),
      () => this.jobs.get(cacheKey) === job && this.jobs.delete(cacheKey),
    );
    this.jobs.set(cacheKey, job);
    for (let i = 0; i < Math.max(1, Math.min(o.workers, fens.length)); i++) spawn();
    return job;
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
    this.closed = true;
    for (const key of [...this.clients.keys()]) this.cancel(key);
    for (const job of this.jobs.values()) job.ctrl.abort();
    this.pool.close();
  }

  private log(msg: string) {
    (this.opts.log ?? console.warn)(msg);
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
  if (err instanceof EngineBusyError) return { t: 'error', code: 'engine_unavailable', message: err.message, id };
  const message = err instanceof Error ? err.message : 'Engine error';
  return { t: 'error', code: 'engine_unavailable', message: `Engine unavailable: ${message}`, id };
}
