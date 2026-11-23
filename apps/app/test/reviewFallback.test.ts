import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stepProgress, type ProgressStep } from '../src/features/engine/smoothProgress';

// A device engine the test controls: usable or not, answering, failing or silent.
const device = vi.hoisted(() => ({
  usable: true,
  mode: 'answer' as 'answer' | 'fail' | 'silent',
  searched: 0,
}));
const server = vi.hoisted(() => ({ calls: [] as string[][], fail: false }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {}, multiRemove: async () => {} },
}));
vi.mock('../src/features/engine/localEngine', () => {
  class AbortError extends Error {
    constructor() {
      super('Aborted');
      this.name = 'AbortError';
    }
  }
  return {
    AbortError,
    localEngine: {
      get usable() {
        return device.usable;
      },
      search: (fen: string, o: { signal?: AbortSignal }) => {
        device.searched++;
        if (device.mode === 'fail') return Promise.reject(new Error('Engine stopped'));
        return new Promise((resolve, reject) => {
          o.signal?.addEventListener('abort', () => reject(new AbortError()), { once: true });
          if (device.mode === 'silent') return;
          setTimeout(() => {
            const best = fen.includes(' w ') ? 'g1f3' : 'g8f6';
            resolve({ lines: new Map([[1, { depth: 12, multipv: 1, score: { cp: 10 }, pv: [best] }]]), bestMove: best });
          }, 5);
        });
      },
    },
  };
});
vi.mock('../src/features/engine/serverEngine', () => ({
  isTransient: () => false,
  evaluateOnServer: async (fens: string[]) => {
    server.calls.push(fens);
    if (server.fail) throw new Error('offline');
    await new Promise((r) => setTimeout(r, 5));
    return fens.map((f) => ({ score: { cp: 0 }, bestMove: f.includes(' w ') ? 'g1f3' : 'g8f6', pv: [], depth: 12 }));
  },
}));

const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let n = 0;

/** Runs a review to the end (a different game each time, so nothing is cached). */
async function review() {
  const { reviewLocally } = await import('../src/features/engine/localReview');
  // Change the game each run: append a different legal move pair so no cache answers it.
  const moves = [...MOVES, ...[['b5a4', 'g8f6'], ['b5c4', 'g8f6'], ['b5e2', 'g8f6'], ['b5d3', 'g8f6'], ['b5f1', 'g8f6']][n++ % 5]!];
  return new Promise<{ where?: string; error?: string; graded: number }>((resolve) => {
    const stop = reviewLocally({ moves, initialFen: START }, (s) => {
      if (!s.final) return;
      stop();
      resolve({ where: s.where, error: s.error, graded: s.review?.moves.length ?? 0 });
    });
  });
}

beforeEach(() => {
  vi.useRealTimers();
  device.usable = true;
  device.mode = 'answer';
  device.searched = 0;
  server.calls = [];
  server.fail = false;
});

describe('game review fallback', () => {
  it('grades on the device when its engine works', async () => {
    const r = await review();
    expect(r).toMatchObject({ where: 'device', graded: 8 });
    expect(server.calls).toHaveLength(0);
  });

  it("uses the server when the device can't run the engine", async () => {
    device.usable = false;
    const r = await review();
    expect(r).toMatchObject({ where: 'server', graded: 8 });
    expect(device.searched).toBe(0);
    // Small requests, so progress moves a step at a time.
    expect(Math.max(...server.calls.map((c) => c.length))).toBeLessThanOrEqual(2);
  });

  it('switches to the server when the device engine fails', async () => {
    device.mode = 'fail';
    const r = await review();
    expect(r).toMatchObject({ where: 'server', graded: 8 });
  });

  it('brings in the server when the device engine goes quiet', async () => {
    device.mode = 'silent';
    const r = await review();
    expect(r).toMatchObject({ where: 'server', graded: 8 });
  }, 15_000);

  it('reports an error only when neither engine can grade', async () => {
    device.mode = 'fail';
    server.fail = true;
    const r = await review();
    expect(r.error).toBeTruthy();
  });
});

describe('smooth review progress', () => {
  const run = (from: ProgressStep, done: number, total: number, ms: number, t0: number) => {
    let p = from;
    for (let t = 100; t <= ms; t += 100) p = stepProgress(p, done, total, t0 + t);
    return p;
  };

  it('keeps moving while no result comes in, without passing far ahead', () => {
    const start: ProgressStep = { shown: 0.03, rate: 0, lastDone: 2, lastAt: 1000 };
    const later = run(start, 2, 60, 10_000, 1000);
    expect(later.shown).toBeGreaterThan(0.04);
    expect(later.shown).toBeLessThan(0.03 + 0.06);
  });

  it('climbs smoothly to a burst of results instead of jumping', () => {
    const start: ProgressStep = { shown: 0.05, rate: 0, lastDone: 3, lastAt: 1000 };
    const one = stepProgress(start, 54, 60, 1100);
    expect(one.shown).toBeLessThan(0.3);
    const second = run(one, 54, 60, 1500, 1100);
    expect(second.shown).toBeGreaterThan(0.85);
  });

  it('never goes backwards', () => {
    let p: ProgressStep = { shown: 0, rate: 0, lastDone: 0, lastAt: 0 };
    let last = 0;
    for (let t = 0; t < 20_000; t += 100) {
      p = stepProgress(p, Math.min(40, Math.floor(t / 700)), 41, t);
      expect(p.shown).toBeGreaterThanOrEqual(last);
      last = p.shown;
    }
    expect(p.shown).toBeLessThan(1);
  });
});
