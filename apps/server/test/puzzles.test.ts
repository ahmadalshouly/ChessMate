import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PuzzleApi } from '../src/puzzles/api';
import { importPuzzleLines, openPuzzleCsv } from '../src/puzzles/importer';
import { SEED_CSV } from '../src/puzzles/setup';
import { SqlitePuzzleStore } from '../src/puzzles/store';
import { ChessServer } from '../src/server';

async function* lines(arr: string[]) {
  yield* arr;
}

describe('puzzle import', () => {
  it('loads the seed CSV with validation', async () => {
    const store = new SqlitePuzzleStore();
    const r = await importPuzzleLines(store, await openPuzzleCsv(SEED_CSV), { validate: true });
    expect(r.skipped).toBe(0);
    expect(store.count()).toBe(r.imported);
    expect(store.count()).toBeGreaterThanOrEqual(10);
    expect(store.themeCounts().mateIn1).toBeGreaterThan(0);
  });

  it('applies quality filters and limits, and upserts on re-import', async () => {
    const store = new SqlitePuzzleStore();
    const row = (id: string, pop: number, plays: number) => `${id},6k1/5ppp/p7/8/8/8/5PPP/3R2K1 b - - 0 1,a6a5 d1d8,900,80,${pop},${plays},mate mateIn1,,`;
    const r = await importPuzzleLines(store, lines(['PuzzleId,FEN', row('a1', 90, 5000), row('a2', -20, 5000), row('a3', 90, 3), row('a4', 95, 900)]), {
      minPopularity: 50,
      minPlays: 100,
    });
    expect(r).toEqual({ read: 4, imported: 2, skipped: 2 });
    await importPuzzleLines(store, lines([row('a1', 91, 6000)]));
    expect(store.count()).toBe(2);
    expect(store.get('a1')!.plays).toBe(6000);
    const limited = new SqlitePuzzleStore();
    expect((await importPuzzleLines(limited, lines([row('b1', 90, 900), row('b2', 90, 900), row('b3', 90, 900)]), { limit: 2 })).imported).toBe(2);
  });
});

describe('puzzle API', () => {
  let server: ChessServer;
  let base: string;
  let t = Date.UTC(2026, 10, 16);
  const store = new SqlitePuzzleStore();

  beforeAll(async () => {
    await importPuzzleLines(store, await openPuzzleCsv(SEED_CSV));
    const api = new PuzzleApi({ store, now: () => t });
    server = new ChessServer({ port: 0, httpHandlers: [(req, res) => api.handle(req, res)] });
    base = `http://localhost:${await server.listen()}/api/puzzles`;
  });
  afterAll(() => server.close());

  const call = async (path: string, init: { token?: string; body?: unknown } = {}) => {
    const res = await fetch(base + path, {
      method: init.body ? 'POST' : 'GET',
      headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), 'content-type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  it('serves the same daily puzzle all day', async () => {
    const a = await call('/daily');
    const b = await call('/daily');
    expect(a.status).toBe(200);
    expect(a.body.day).toBe('2026-11-16');
    expect(b.body.puzzle.id).toBe(a.body.puzzle.id);
  });

  it('filters next puzzle by theme', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await call('/next?theme=mateIn2');
      expect(r.body.puzzle.themes).toContain('mateIn2');
    }
    expect((await call('/next?theme=zugzwang')).status).toBe(404);
  });

  it('rates the first attempt only, graded by the server', async () => {
    const token = 'anon:test-device-0001';
    const id = 'cm0008';
    const cheat = await call(`/${id}/attempt`, { token, body: { moves: ['d5g8'], hints: 0 } });
    expect(cheat.body.solved).toBe(false);
    expect(cheat.body.rating.after).toBeLessThan(cheat.body.rating.before);

    const again = await call(`/${id}/attempt`, { token, body: { moves: ['d5g8', 'h6f7'], hints: 0 } });
    expect(again.body).toEqual({ solved: true });

    const other = await call('/cm0002/attempt', { token, body: { moves: ['g5f7'], hints: 0 } });
    expect(other.body.solved).toBe(true);
    expect(other.body.rating.after).toBeGreaterThan(other.body.rating.before);

    const me = await call('/me', { token });
    expect(me.body).toMatchObject({ attempts: 2, solved: 1, provisional: true });
    const anon = await call('/cm0002/attempt', { body: { moves: ['g5f7'] } });
    expect(anon.body).toEqual({ solved: true });
  });

  it('returns climbing run ladders and keeps best scores', async () => {
    const r = await call('/run?mode=rush');
    expect(r.body.puzzles.length).toBeGreaterThan(5);
    expect(new Set(r.body.puzzles.map((p: any) => p.id)).size).toBe(r.body.puzzles.length);
    expect((await call('/run?mode=nope')).status).toBe(400);
    const token = 'dev:runner:Runner';
    expect((await call('/run', { token, body: { mode: 'streak', score: 7 } })).body).toMatchObject({ best: 7, newBest: true });
    expect((await call('/run', { token, body: { mode: 'streak', score: 3 } })).body).toMatchObject({ best: 7, newBest: false });
    expect((await call('/me', { token })).body.bestStreak).toBe(7);
  });

  it('answers CORS preflight and leaves other paths alone', async () => {
    const pre = await fetch(base + '/next', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    const health = await fetch(base.replace('/api/puzzles', '/health'));
    expect(health.status).toBe(200);
  });
});
