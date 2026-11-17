/** Fixed-window limiter keyed by e.g. "login:<ip>". In-memory; per process. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit and returns false when the key is over its limit. */
  take(key: string, now: number): boolean {
    let e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, e);
    }
    e.count++;
    if (this.hits.size > 10_000) this.sweep(now);
    return e.count <= this.limit;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, e] of this.hits) if (e.resetAt <= now) this.hits.delete(k);
  }
}
