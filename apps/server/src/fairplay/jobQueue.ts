/**
 * Minimal in-process background job queue. Jobs run one at a time (engine
 * analysis is CPU-heavy) off the request path, so the game server never
 * waits on them. Swap for BullMQ / a worker service when running several
 * nodes; the producer side only needs `enqueue`.
 */
export class JobQueue<T> {
  private pending: T[] = [];
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly worker: (job: T) => Promise<void>,
    private readonly opts: { concurrency?: number; maxPending?: number; onError?: (e: unknown, job: T) => void } = {},
  ) {}

  get size() {
    return this.pending.length + this.running;
  }

  enqueue(job: T) {
    this.pending.push(job);
    // Under sustained overload drop the oldest work rather than grow without bound.
    if (this.pending.length > (this.opts.maxPending ?? 1000)) this.pending.shift();
    this.pump();
  }

  /** Resolves once every queued job has finished. Mainly for tests and graceful shutdown. */
  idle(): Promise<void> {
    if (this.size === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private pump() {
    while (this.running < (this.opts.concurrency ?? 1) && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running++;
      setImmediate(() => {
        this.worker(job)
          .catch((e) => this.opts.onError?.(e, job))
          .finally(() => {
            this.running--;
            this.pump();
            if (this.size === 0) for (const w of this.idleWaiters.splice(0)) w();
          });
      });
    }
  }
}
