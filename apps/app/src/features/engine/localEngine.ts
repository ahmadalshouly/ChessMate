import { parseInfoLine, type UciInfo } from '@chessmate/core';

import type { FarmOut } from './engineTypes';
import { openTransport, transportSupported, type EngineTransport } from './transport';

export interface LocalSearchOptions {
  depth: number;
  multipv: number;
  /** Hard cap per position, so one very sharp position can't stall a review. */
  movetimeMs?: number;
  /** Jumps the queue (a position the player is looking at right now). */
  urgent?: boolean;
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
 * on first use and stops itself when idle. If the engine can't run here,
 * `usable` turns false and callers use the server instead.
 */
class LocalEngine {
  private transport: EngineTransport | null = null;
  private opening: Promise<EngineTransport> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private broken = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  /** False once the engine has failed on this device (or never could run). */
  get usable(): boolean {
    return !this.broken && transportSupported();
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
          t.send({ t: 'search', id, fen, depth: opts.depth, multipv: opts.multipv, movetime: opts.movetimeMs, urgent: opts.urgent });
          opts.signal?.addEventListener('abort', () => this.transport?.send({ t: 'cancel', id }), { once: true });
        },
        (err: Error) => this.failAll(err),
      );
    });
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
      const opening = openTransport((m) => this.onMessage(m)).then((t) => {
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
  }

  private settleAbort(id: number) {
    const p = this.pending.get(id);
    this.pending.delete(id);
    p?.reject(new AbortError());
  }

  private failAll(err: Error) {
    if (err instanceof AbortError) return;
    this.broken = true;
    const all = [...this.pending.values()];
    this.pending.clear();
    this.shutdown();
    all.forEach((p) => p.reject(err));
  }

  /** Keeps the engines alive while there is work; shuts them down after IDLE_MS without any. */
  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size > 0) this.touch();
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
