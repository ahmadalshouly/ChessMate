import { parseInfoLine, type UciInfo } from '@chessmate/core';

import type { FarmOut } from './engineTypes';
import { onReviewSettings, reviewSettings } from './reviewSettings';
import { openTransport, transportSupported, type EngineTransport } from './transport';

export interface LocalSearchOptions {
  depth: number;
  multipv: number;
  /** Hard cap per position, so one very sharp position can't stall a review. */
  movetimeMs?: number;
  /** Jumps the queue (a position the player is looking at right now). */
  urgent?: boolean;
  /** The game up to this position: its start and the moves since, so the engine knows about repetitions. */
  history?: { start: string; moves: string[] };
  /** Which engine should search it when it can (see farmSource.ts): consecutive positions on one engine reuse its work. */
  lane?: number;
  /** Play at Stockfish's strength limit (UCI_Elo) rather than full strength: a computer opponent's move. */
  elo?: number;
  signal?: AbortSignal;
}

export interface LocalSearchResult {
  /** Last complete line per multipv index. Scores are from the side to move. */
  lines: Map<number, UciInfo>;
  bestMove: string | null;
}

interface Pending {
  resolve: (r: LocalSearchResult) => void;
  reject: (e: Error) => void;
}

/** Engines are shut down after this long without work, to give memory and battery back. */
const IDLE_MS = 60_000;
/** Failed starts (or crashes) in a row before the device engine is given up on for this session. */
const MAX_FAILURES = 2;

export class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}

/**
 * Stockfish on the player's own device. The engines and their queue live off
 * the app's thread (farmSource.ts: a Web Worker on the web, a hidden WebView
 * on phones); this class sends searches and resolves their results. It starts
 * on first use and stops itself when idle. After a failure it tries once more
 * with a single engine (a phone short on memory can kill a WebView running
 * several); if that fails too, `usable` turns false and reviews use the
 * server's engine instead.
 */
class LocalEngine {
  private transport: EngineTransport | null = null;
  private opening: Promise<EngineTransport> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private failures = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Callers that need the engines kept running between searches (a game against the computer). */
  private holds = 0;
  /** Another engine build was picked: restart with it as soon as nothing is searching. */
  private reloadWhenIdle = false;

  /** False once the engine has failed on this device (or never could run). */
  get usable(): boolean {
    return this.failures < MAX_FAILURES && transportSupported();
  }

  search(fen: string, opts: LocalSearchOptions): Promise<LocalSearchResult> {
    if (!this.usable) return Promise.reject(new Error('On-device engine unavailable'));
    if (opts.signal?.aborted) return Promise.reject(new AbortError());
    const id = this.nextId++;
    return new Promise<LocalSearchResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.touch();
      this.start().then(
        (t) => {
          if (!this.pending.has(id)) return;
          if (opts.signal?.aborted) return this.settleAbort(id);
          const h = opts.history;
          t.send({
            t: 'search',
            id,
            ...(h && h.moves.length ? { fen: h.start, moves: h.moves.join(' ') } : { fen }),
            lane: opts.lane,
            depth: opts.depth,
            multipv: opts.multipv,
            movetime: opts.movetimeMs,
            urgent: opts.urgent,
            ...(opts.elo ? { elo: opts.elo } : {}),
          });
          opts.signal?.addEventListener('abort', () => this.transport?.send({ t: 'cancel', id }), { once: true });
        },
        (err: Error) => this.failAll(err),
      );
    });
  }

  /** How many engines search side by side (starting them if needed). */
  async engines(): Promise<number> {
    if (!this.usable) throw new Error('On-device engine unavailable');
    this.touch();
    return (await this.start()).size;
  }

  /**
   * Keeps the engines running between searches until the returned function is
   * called, so a player who thinks for a few minutes against the computer does
   * not wait for the engines to start again. Starting is still on first use.
   */
  hold(): () => void {
    this.holds++;
    this.touch();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
      this.touch();
      this.reloadIfIdle();
    };
  }

  /** Restarts the engines with the build picked in Settings: now when idle, else once the searches in hand are done. */
  reload(): void {
    this.reloadWhenIdle = true;
    this.reloadIfIdle();
  }

  private reloadIfIdle() {
    if (!this.reloadWhenIdle || this.pending.size > 0 || this.holds > 0) return;
    this.reloadWhenIdle = false;
    this.shutdown();
  }

  /** Starts the engines now (for example when a game ends), so the first search doesn't wait. */
  warmUp(): void {
    if (!this.usable) return;
    this.touch();
    this.start().catch((err: Error) => this.failAll(err));
  }

  private start(): Promise<EngineTransport> {
    if (this.transport) return Promise.resolve(this.transport);
    if (!this.opening) {
      // After a failure, one engine only: lighter on a phone that is short of memory.
      const opening = openTransport((m) => this.onMessage(m), this.failures > 0 ? 1 : undefined).then((t) => {
        if (this.opening !== opening) {
          // Shut down while starting.
          t.dispose();
          throw new AbortError();
        }
        this.transport = t;
        return t;
      });
      opening.catch(() => {
        if (this.opening === opening) this.opening = null;
      });
      this.opening = opening;
    }
    return this.opening;
  }

  private onMessage(m: FarmOut) {
    if (m.t === 'error') return this.failAll(new Error(m.message));
    if (m.t === 'cancelled') return this.settleAbort(m.id);
    if (m.t !== 'result') return;
    // A result means the engine works here: forget earlier failures.
    this.failures = 0;
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    const lines = new Map<number, UciInfo>();
    for (const raw of m.lines) {
      const info = parseInfoLine(raw);
      if (info?.pv?.length && info.score && !info.bound) lines.set(info.multipv ?? 1, info);
    }
    p.resolve({ lines, bestMove: m.best });
    this.touch();
    this.reloadIfIdle();
  }

  private settleAbort(id: number) {
    const p = this.pending.get(id);
    this.pending.delete(id);
    p?.reject(new AbortError());
    this.reloadIfIdle();
  }

  private failAll(err: Error) {
    if (err instanceof AbortError) return;
    this.failures++;
    const all = [...this.pending.values()];
    this.pending.clear();
    this.shutdown();
    all.forEach((p) => p.reject(err));
  }

  /** Keeps the engines alive while there is work; shuts them down after IDLE_MS without any. */
  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size > 0 || this.holds > 0) this.touch();
      else this.shutdown();
    }, IDLE_MS);
  }

  private shutdown() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.transport?.dispose();
    this.transport = null;
    this.opening = null;
  }
}

export const localEngine = new LocalEngine();

// The engine build picked in Settings (lite or full) applies from the next start.
let build = reviewSettings().engine;
onReviewSettings(() => {
  const next = reviewSettings().engine;
  if (next === build) return;
  build = next;
  localEngine.reload();
});
