/**
 * Token-bucket rate limiting. Each bucket refills continuously at
 * `perSecond` tokens up to `burst`. Time is injected for deterministic tests.
 */
export interface BucketSpec {
  burst: number;
  perSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly spec: BucketSpec,
    now: number,
  ) {
    this.tokens = spec.burst;
    this.last = now;
  }

  take(now: number, cost = 1): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.spec.burst, this.tokens + elapsed * this.spec.perSecond);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

export interface RateLimitConfig {
  /** All messages on one socket. */
  messages: BucketSpec;
  /** Moves on one socket (premoves can arrive in quick bursts). */
  moves: BucketSpec;
  /** Seek / cancelSeek churn on one socket. */
  seeks: BucketSpec;
  /** New connections from one IP address. */
  connectionsPerIp: BucketSpec;
  /** Rejected messages on a socket before it is closed. */
  maxViolations: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  messages: { burst: 40, perSecond: 15 },
  moves: { burst: 10, perSecond: 4 },
  seeks: { burst: 5, perSecond: 0.5 },
  connectionsPerIp: { burst: 20, perSecond: 1 },
  maxViolations: 50,
};

export type LimitKind = 'messages' | 'moves' | 'seeks';

/** Per-socket limiter. */
export class ConnectionLimiter {
  private readonly buckets: Record<LimitKind, TokenBucket>;
  violations = 0;

  constructor(
    private readonly cfg: RateLimitConfig,
    now: number,
  ) {
    this.buckets = {
      messages: new TokenBucket(cfg.messages, now),
      moves: new TokenBucket(cfg.moves, now),
      seeks: new TokenBucket(cfg.seeks, now),
    };
  }

  /** Returns 'ok', 'limited' (reject this message) or 'disconnect' (too many violations). */
  check(kind: LimitKind | null, now: number): 'ok' | 'limited' | 'disconnect' {
    const ok = this.buckets.messages.take(now) && (kind === null || kind === 'messages' || this.buckets[kind].take(now));
    if (ok) return 'ok';
    this.violations++;
    return this.violations >= this.cfg.maxViolations ? 'disconnect' : 'limited';
  }
}

/** Per-IP connection limiter with idle-entry cleanup. */
export class IpLimiter {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>();

  constructor(private readonly spec: BucketSpec) {}

  allow(ip: string, now: number): boolean {
    let e = this.buckets.get(ip);
    if (!e) {
      e = { bucket: new TokenBucket(this.spec, now), seen: now };
      this.buckets.set(ip, e);
    }
    e.seen = now;
    if (this.buckets.size > 10_000) this.sweep(now);
    return e.bucket.take(now);
  }

  /** Drops entries idle long enough to have fully refilled. */
  sweep(now: number) {
    const idle = (this.spec.burst / this.spec.perSecond) * 1000;
    for (const [ip, e] of this.buckets) if (now - e.seen > idle) this.buckets.delete(ip);
  }
}
