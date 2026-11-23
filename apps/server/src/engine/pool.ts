import type { Engine } from './uciEngine';

/** Who goes first when every engine is busy: analysis board, then reviews a player asked for, then background reviews. */
export type EnginePriority = 'high' | 'normal' | 'low';
const RANK: Record<EnginePriority, number> = { high: 0, normal: 1, low: 2 };

/** The queue is full: say so at once instead of making the player wait minutes. */
export class EngineBusyError extends Error {
  constructor() {
    super('The engine is busy right now. Try again in a moment.');
    this.name = 'EngineBusyError';
  }
}

export interface RunOptions {
  priority?: EnginePriority;
  /** Refuse (EngineBusyError) when this many requests are already waiting. */
  maxQueue?: number;
}

interface Waiter {
  rank: number;
  resolve: (e: Engine) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/**
 * A fixed number of engine processes shared by all players. Engines start
 * lazily on first use and are replaced if they crash.
 */
export class EnginePool {
  private idle: Engine[] = [];
  private starting = 0;
  private total = 0;
  private queue: Waiter[] = [];
  private closed = false;

  constructor(
    private readonly factory: () => Promise<Engine>,
    readonly size = 1,
  ) {}

  get queued() {
    return this.queue.length;
  }

  /**
   * Runs `fn` with an engine to itself. Aborting while queued rejects with AbortError.
   * Waiters are served by priority, then first come first served.
   */
  async run<T>(fn: (engine: Engine) => Promise<T>, signal?: AbortSignal, opts: RunOptions = {}): Promise<T> {
    const engine = await this.acquire(signal, opts);
    try {
      return await fn(engine);
    } finally {
      this.release(engine);
    }
  }

  private acquire(signal?: AbortSignal, opts: RunOptions = {}): Promise<Engine> {
    if (this.closed) return Promise.reject(new Error('engine pool closed'));
    if (signal?.aborted) return Promise.reject(abortError());
    const engine = this.idle.pop();
    if (engine) return Promise.resolve(engine);
    if (opts.maxQueue !== undefined && this.queue.length >= opts.maxQueue) return Promise.reject(new EngineBusyError());
    return new Promise((resolve, reject) => {
      const w: Waiter = { rank: RANK[opts.priority ?? 'normal'], resolve, reject, signal };
      if (signal) {
        w.onAbort = () => {
          const i = this.queue.indexOf(w);
          if (i >= 0) this.queue.splice(i, 1);
          reject(abortError());
        };
        signal.addEventListener('abort', w.onAbort, { once: true });
      }
      // After everyone of the same or higher priority, ahead of anyone lower.
      const at = this.queue.findIndex((q) => q.rank > w.rank);
      if (at < 0) this.queue.push(w);
      else this.queue.splice(at, 0, w);
      this.grow();
    });
  }

  private grow() {
    if (this.total + this.starting >= this.size || this.queue.length === 0) return;
    this.starting++;
    this.factory().then(
      (engine) => {
        this.starting--;
        this.total++;
        this.release(engine);
      },
      (err: Error) => {
        this.starting--;
        // Fail everyone waiting: the engine cannot be started right now.
        for (const w of this.queue.splice(0)) {
          w.signal?.removeEventListener('abort', w.onAbort!);
          w.reject(err);
        }
      },
    );
  }

  private release(engine: Engine) {
    if (!engine.alive || this.closed) {
      this.total = Math.max(0, this.total - (engine.alive ? 0 : 1));
      if (this.closed) engine.close();
      this.grow();
      return;
    }
    const next = this.queue.shift();
    if (next) {
      next.signal?.removeEventListener('abort', next.onAbort!);
      next.resolve(engine);
    } else {
      this.idle.push(engine);
    }
  }

  close() {
    this.closed = true;
    for (const e of this.idle.splice(0)) e.close();
    for (const w of this.queue.splice(0)) w.reject(new Error('engine pool closed'));
  }
}

function abortError() {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}
