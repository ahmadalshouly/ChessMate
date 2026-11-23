import {
  ANALYSIS_LIMITS,
  Game,
  lineFromInfo,
  positionEvalFrom,
  terminalScore,
  terminalState,
  type EngineLine,
  type PositionAnalysis,
  type PositionEval,
  type ServerMessage,
  type UciInfo,
} from '@chessmate/core';
import { EngineBusyError, type EnginePool } from './pool';

export interface AnalysisServiceOptions {
  /** Minimum gap between streamed analysis updates. */
  updateIntervalMs?: number;
  /** Analysis-board requests allowed to wait for an engine before "busy" (default 64). */
  maxAnalysisQueue?: number;
  log?: (msg: string) => void;
}

export type Send = (msg: ServerMessage) => void;

interface Client {
  analysis?: { id: number; ctrl: AbortController };
}

/**
 * Turns engine output into protocol messages: live analysis for the analysis
 * board, and evaluations for broadcast games. Game reviews are not graded
 * here: they run on the players' devices (see games/http for how they are
 * saved). The caller (game server) decides who may use it; this class only
 * runs and cancels searches.
 */
export class AnalysisService {
  private clients = new Map<string, Client>();

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

  /**
   * One position's evaluation for shared analysis (broadcast games): runs at
   * low priority so players' own analysis and reviews go first.
   */
  async evaluate(fen: string, o: { depth?: number; movetimeMs?: number; signal?: AbortSignal } = {}): Promise<PositionEval> {
    const term = terminalState(fen);
    if (term) return { score: terminalScore(fen, term), pv: [], depth: 0 };
    const ctrl = new AbortController();
    o.signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    const res = await this.pool.run(
      (engine) => engine.search(fen, { multipv: EVAL_MULTIPV, depth: o.depth ?? 16, movetimeMs: o.movetimeMs ?? 1200 }, undefined, ctrl.signal),
      ctrl.signal,
      { priority: 'low', maxQueue: 16 },
    );
    return positionEvalFrom(fen, res.lines.get(1) ?? null, res.bestMove ?? undefined, res.lines.get(2) ?? null);
  }

  stop(key: string, id?: number) {
    const c = this.clients.get(key);
    if (c?.analysis && (id === undefined || c.analysis.id === id)) c.analysis.ctrl.abort();
  }

  /** Cancels everything a client is running (disconnect, or a live game started). */
  cancel(key: string) {
    const c = this.clients.get(key);
    if (!c) return;
    c.analysis?.ctrl.abort();
    this.clients.delete(key);
  }

  close() {
    for (const key of [...this.clients.keys()]) this.cancel(key);
    this.pool.close();
  }
}

/** Lines per position for broadcast evaluations: the second spots only moves. */
const EVAL_MULTIPV = 2;

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function engineError(err: unknown, id: number): ServerMessage {
  if (err instanceof EngineBusyError) return { t: 'error', code: 'engine_unavailable', message: err.message, id };
  const message = err instanceof Error ? err.message : 'Engine error';
  return { t: 'error', code: 'engine_unavailable', message: `Engine unavailable: ${message}`, id };
}
