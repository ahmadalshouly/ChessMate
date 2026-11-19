import { describe, expect, it } from 'vitest';

import { EngineBusyError, EnginePool } from '../src/engine/pool';
import type { Engine } from '../src/engine/uciEngine';

const fakeEngine = (): Engine => ({ alive: true, close: () => undefined, search: async () => ({ lines: new Map(), bestMove: null }) as never });

describe('engine pool', () => {
  it('serves analysis first, then requested reviews, then background reviews', async () => {
    const pool = new EnginePool(async () => fakeEngine(), 1);
    let release!: () => void;
    const order: string[] = [];
    // Hold the only engine so the next requests queue up.
    const holder = pool.run(() => new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 0));
    const jobs = [
      pool.run(async () => void order.push('background'), undefined, { priority: 'low' }),
      pool.run(async () => void order.push('review'), undefined, { priority: 'normal' }),
      pool.run(async () => void order.push('analysis'), undefined, { priority: 'high' }),
      pool.run(async () => void order.push('review 2')),
    ];
    release();
    await holder;
    await Promise.all(jobs);
    expect(order).toEqual(['analysis', 'review', 'review 2', 'background']);
    pool.close();
  });

  it('says "busy" at once when the queue is full instead of waiting', async () => {
    const pool = new EnginePool(async () => fakeEngine(), 1);
    let release!: () => void;
    const holder = pool.run(() => new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 0));
    const waiting = pool.run(async () => 'ok', undefined, { maxQueue: 1 });
    await expect(pool.run(async () => 'late', undefined, { maxQueue: 1 })).rejects.toBeInstanceOf(EngineBusyError);
    release();
    await holder;
    await expect(waiting).resolves.toBe('ok');
    pool.close();
  });
});
