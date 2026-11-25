import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stepProgress, type ProgressStep } from '../src/features/engine/smoothProgress';

// A device engine the test controls: usable or not, answering, failing or silent.
const device = vi.hoisted(() => ({
  usable: true,
  mode: 'answer' as 'answer' | 'fail' | 'silent',
  /** How deep searches (the second pass) behave, when not like the quick ones. */
  deepMode: null as null | 'fail' | 'silent',
  searched: 0,
  lanes: new Set<number>(),
  histories: [] as number[],
  /** Moves before each position searched deep. */
  deep: [] as number[],
  /** Score (side to move) the engine gives, by number of moves before the position; 10 otherwise. */
  scores: new Map<number, number>(),
}));
const server = vi.hoisted(() => ({ calls: [] as string[][], fail: false }));
/** Opening moves the masters' games call theory, as the server would answer (Dig Deep). */
const theory = vi.hoisted(() => ({ plies: 0, asked: 0 }));

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
      engines: async () => {
        if (!device.usable) throw new Error('unavailable');
        return 3;
      },
      search: (fen: string, o: { depth: number; signal?: AbortSignal; lane?: number; history?: { start: string; moves: string[] } }) => {
        const isDeep = o.depth > 10;
        const ply = o.history?.moves.length ?? -1;
        device.searched++;
        device.lanes.add(o.lane ?? -1);
        if (isDeep) device.deep.push(ply);
        else device.histories.push(ply);
        const mode = isDeep && device.deepMode ? device.deepMode : device.mode;
        if (mode === 'fail') return Promise.reject(new Error('Engine stopped'));
        return new Promise((resolve, reject) => {
          o.signal?.addEventListener('abort', () => reject(new AbortError()), { once: true });
          if (mode === 'silent') return;
          setTimeout(() => {
            const best = fen.includes(' w ') ? 'g1f3' : 'g8f6';
            // The deep search sees the position as equal: the quick one's verdict was wrong.
            const cp = isDeep ? 10 : (device.scores.get(ply) ?? 10);
            resolve({ lines: new Map([[1, { depth: o.depth, multipv: 1, score: { cp }, pv: [best] }]]), bestMove: best });
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

vi.mock('../src/features/explorer/api', () => ({
  fetchTheoryPlies: async () => {
    theory.asked++;
    await new Promise((r) => setTimeout(r, 5));
    return theory.plies;
  },
}));

const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let n = 0;

const ENDINGS = [
  ['b5a4', 'g8f6'],
  ['b5c4', 'g8f6'],
  ['b5e2', 'g8f6'],
  ['b5d3', 'g8f6'],
  ['b5f1', 'g8f6'],
  ['b5a4', 'b7b5'],
  ['b5c4', 'b7b5'],
  ['b5e2', 'd7d6'],
  ['b5d3', 'd7d6'],
  ['b5f1', 'd7d6'],
];

/** Runs a review to the end (a different game each time, so nothing is cached). */
async function review() {
  const { reviewLocally } = await import('../src/features/engine/localReview');
  // Change the game each run: append a different legal move pair so no cache answers it.
  const moves = [...MOVES, ...ENDINGS[n++ % ENDINGS.length]!];
  const shown: { moves: number; classes: string[] }[] = [];
  return new Promise<{ where?: string; error?: string; graded: number; classes: string[]; maxDepth?: number; shown: typeof shown }>((resolve) => {
    const stop = reviewLocally({ moves, initialFen: START }, (s) => {
      if (!s.final) {
        if (s.review) shown.push({ moves: s.review.moves.length, classes: s.review.moves.map((m) => m.judgement.classification) });
        return;
      }
      stop();
      resolve({
        where: s.where,
        error: s.error,
        graded: s.review?.moves.length ?? 0,
        classes: s.review?.moves.map((m) => m.judgement.classification) ?? [],
        maxDepth: s.review?.maxDepth,
        shown,
      });
    });
  });
}

beforeEach(() => {
  vi.useRealTimers();
  device.usable = true;
  device.mode = 'answer';
  device.deepMode = null;
  device.searched = 0;
  device.lanes = new Set();
  device.histories = [];
  device.deep = [];
  device.scores = new Map();
  server.calls = [];
  server.fail = false;
  theory.plies = 0;
  theory.asked = 0;
});

describe('game review fallback', () => {
  it('grades on the device when its engine works', async () => {
    const r = await review();
    expect(r).toMatchObject({ where: 'device', graded: 8 });
    expect(server.calls).toHaveLength(0);
    // Spread over the engines in stretches, each search with the moves that led to it.
    expect([...device.lanes].sort()).toEqual([0, 1, 2]);
    expect(device.histories.sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('searches again deeper around the moves the quick pass did not call best', async () => {
    // The quick pass thinks White's 7th move (the bishop retreat) hands Black a big advantage.
    // (Positions after the game's common opening come from the session's cache, so the change is past them.)
    device.scores.set(7, 300);
    const r = await review();
    expect(r).toMatchObject({ where: 'device', graded: 8, maxDepth: 14 });
    // The positions around that move are searched deep; the opening's are not.
    expect(device.deep).toEqual(expect.arrayContaining([6, 7]));
    expect(device.deep).not.toContain(0);
    // The deep results stand: the retreat is no blunder.
    expect(r.classes[6]).not.toBe('blunder');
    // The quick pass's blunder was never shown.
    expect(r.shown.every((s) => s.classes[6] !== 'blunder')).toBe(true);
    expect(server.calls).toHaveLength(0);
  });

  it('grades masters theory as Book and does not search it deeper', async () => {
    // A small slip on move 7 that the quick pass would grade below best, but the masters' games say all 8 moves are theory.
    device.scores.set(7, 30);
    theory.plies = 8;
    const r = await review();
    expect(theory.asked).toBe(1);
    expect(r).toMatchObject({ where: 'device', graded: 8 });
    expect(r.classes).toEqual(Array(8).fill('book'));
    expect(device.deep).toEqual([]);
  });

  it('keeps the quick grades when the deep pass fails, without the server', async () => {
    device.scores.set(7, 300);
    device.deepMode = 'fail';
    const r = await review();
    expect(r).toMatchObject({ where: 'device', graded: 8 });
    expect(r.error).toBeUndefined();
    expect(r.classes[6]).toBe('blunder');
    expect(server.calls).toHaveLength(0);
  });

  it('gives up deepening when the deep pass goes quiet while watched', async () => {
    device.scores.set(7, 300);
    device.deepMode = 'silent';
    const r = await review();
    expect(r).toMatchObject({ where: 'device', graded: 8 });
    expect(r.classes[6]).toBe('blunder');
    expect(server.calls).toHaveLength(0);
  }, 30_000);

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
  }, 30_000);

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
