import { DEFAULT_RANGE_OPTIONS, formatTimeControl, matchmakingGap, type RatingRangeOptions, type TimeControl } from '@chessmate/core';

export interface Seek {
  playerId: string;
  rating: number;
  /** Rating deviation; provisional players get a wider initial window. Defaults to established. */
  rd?: number;
  timeControl: TimeControl;
  rated: boolean;
  createdAt: number;
  /** Optional explicit bounds chosen by the player. */
  ratingRange?: [number, number];
  /** Fixed ± window chosen by the player; it never widens past this. */
  range?: number;
  /** Side the player asked for; absent means either. */
  color?: 'w' | 'b';
}

export interface MatchOptions extends RatingRangeOptions {
  /** After this long without a fixed range, anyone in the pool is acceptable. */
  openAfterMs: number;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = { ...DEFAULT_RANGE_OPTIONS, openAfterMs: 45_000 };

export interface Pairing {
  a: Seek;
  b: Seek;
}

/** Which seek plays white: a stated preference wins, otherwise a coin flip. */
export function whiteOf(p: Pairing, coin: () => boolean = () => Math.random() < 0.5): Seek {
  if (p.a.color === 'w' || p.b.color === 'b') return p.a;
  if (p.b.color === 'w' || p.a.color === 'b') return p.b;
  return coin() ? p.a : p.b;
}

/**
 * Pools seeks by (time control, rated) and pairs the closest ratings. The
 * acceptable rating gap widens the longer a player waits so nobody waits
 * forever on a quiet pool; after `openAfterMs` the window is unlimited unless
 * the player fixed a range.
 */
export class Matchmaker {
  private pools = new Map<string, Seek[]>();

  private readonly opts: MatchOptions;

  constructor(opts: Partial<MatchOptions> = {}) {
    this.opts = { ...DEFAULT_MATCH_OPTIONS, ...opts };
  }

  private key(s: Pick<Seek, 'timeControl' | 'rated'>) {
    return `${formatTimeControl(s.timeControl)}:${s.rated ? 'r' : 'c'}`;
  }

  add(seek: Seek): void {
    this.remove(seek.playerId);
    const k = this.key(seek);
    const pool = this.pools.get(k) ?? [];
    pool.push(seek);
    this.pools.set(k, pool);
  }

  remove(playerId: string): boolean {
    for (const [k, pool] of this.pools) {
      const i = pool.findIndex((s) => s.playerId === playerId);
      if (i >= 0) {
        pool.splice(i, 1);
        if (pool.length === 0) this.pools.delete(k);
        return true;
      }
    }
    return false;
  }

  has(playerId: string): boolean {
    for (const pool of this.pools.values()) if (pool.some((s) => s.playerId === playerId)) return true;
    return false;
  }

  get size(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.length;
    return n;
  }

  get(playerId: string): Seek | undefined {
    for (const pool of this.pools.values()) {
      const s = pool.find((x) => x.playerId === playerId);
      if (s) return s;
    }
    return undefined;
  }

  all(): Seek[] {
    return [...this.pools.values()].flat();
  }

  /** Seeks sharing this seek's pool, including itself. */
  poolSize(seek: Seek): number {
    return this.pools.get(this.key(seek))?.length ?? 0;
  }

  stats(): { timeControl: Seek['timeControl']; rated: boolean; seeking: number }[] {
    return [...this.pools.values()]
      .filter((p) => p.length > 0)
      .map((p) => ({ timeControl: p[0]!.timeControl, rated: p[0]!.rated, seeking: p.length }));
  }

  /** Current ± rating window for a seek; Infinity once the window is fully open. */
  allowedGap(seek: Seek, now: number): number {
    const waitedMs = Math.max(0, now - seek.createdAt);
    // Glicko-aware window: provisional players (high RD) start wider; it widens while waiting.
    const grown = matchmakingGap({ rd: seek.rd ?? 0 }, waitedMs, this.opts);
    if (seek.range !== undefined) return Math.min(seek.range, grown);
    if (waitedMs >= this.opts.openAfterMs) return Infinity;
    return grown;
  }

  private compatible(a: Seek, b: Seek, now: number): boolean {
    if (a.playerId === b.playerId) return false;
    if (a.color && a.color === b.color) return false;
    const gap = Math.abs(a.rating - b.rating);
    if (gap > Math.min(this.allowedGap(a, now), this.allowedGap(b, now))) return false;
    const inRange = (s: Seek, r: number) => !s.ratingRange || (r >= s.ratingRange[0] && r <= s.ratingRange[1]);
    return inRange(a, b.rating) && inRange(b, a.rating);
  }

  /** Runs one matching pass and removes paired seeks. Oldest seeks are served first. */
  tick(now: number): Pairing[] {
    const pairings: Pairing[] = [];
    for (const [k, pool] of this.pools) {
      pool.sort((x, y) => x.createdAt - y.createdAt);
      const taken = new Set<number>();
      for (let i = 0; i < pool.length; i++) {
        if (taken.has(i)) continue;
        let best = -1;
        let bestGap = Infinity;
        for (let j = 0; j < pool.length; j++) {
          if (j === i || taken.has(j)) continue;
          if (!this.compatible(pool[i]!, pool[j]!, now)) continue;
          const gap = Math.abs(pool[i]!.rating - pool[j]!.rating);
          if (gap < bestGap) {
            bestGap = gap;
            best = j;
          }
        }
        if (best >= 0) {
          taken.add(i).add(best);
          pairings.push({ a: pool[i]!, b: pool[best]! });
        }
      }
      const rest = pool.filter((_, i) => !taken.has(i));
      if (rest.length) this.pools.set(k, rest);
      else this.pools.delete(k);
    }
    return pairings;
  }
}
