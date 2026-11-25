import { Game, START_FEN, explorerKey } from '@chessmate/core';
import { addMove, createGame, ensureUser, finishGame, openDb, type DbHandle } from '@chessmate/db';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ExplorerError, ExplorerService, LichessExplorer, explorerRoutes } from '../src/explorer';

const AFTER_E4 = new Game(START_FEN);
AFTER_E4.move('e2e4');

/** A fake Lichess explorer: answers by position, counts requests, can be told to fail. */
function fakeLichess() {
  const calls: string[] = [];
  let status = 200;
  let active = 0;
  let maxActive = 0;
  const answers: Record<string, unknown> = {
    [explorerKey(START_FEN)]: {
      white: 480,
      draws: 70,
      black: 450,
      moves: [
        { uci: 'e2e4', san: 'e4', white: 260, draws: 40, black: 230, averageRating: 2010 },
        { uci: 'd2d4', san: 'd4', white: 200, draws: 25, black: 180, averageRating: 2030 },
        { uci: 'a2a3', san: 'a3', white: 2, draws: 0, black: 3, averageRating: 1900 },
      ],
      opening: null,
    },
    [explorerKey(AFTER_E4.fen)]: {
      white: 200,
      draws: 40,
      black: 190,
      moves: [
        { uci: 'c7c5', san: 'c5', white: 100, draws: 20, black: 100, averageRating: 2050 },
        { uci: 'e7e5', san: 'e5', white: 100, draws: 20, black: 90, averageRating: 2000 },
      ],
      opening: { eco: 'B00', name: "King's Pawn Game" },
    },
  };
  const fetchFn = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    if (status !== 200) return new Response('{}', { status });
    const body = answers[explorerKey(url.searchParams.get('fen')!)] ?? { white: 0, draws: 0, black: 0, moves: [], opening: null };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return {
    fetch: fetchFn,
    calls,
    setStatus: (s: number) => (status = s),
    get maxActive() {
      return maxActive;
    },
  };
}

describe('LichessExplorer', () => {
  it('sends the token, asks for the collection with its filters, and one request at a time', async () => {
    const fake = fakeLichess();
    const seen: Record<string, string>[] = [];
    const lichess = new LichessExplorer({
      token: 'lip_test',
      fetch: (async (input: string | URL, init?: RequestInit) => {
        seen.push(init?.headers as Record<string, string>);
        return fake.fetch(input as string, init);
      }) as typeof fetch,
    });
    await Promise.all([
      lichess.fetch('lichess', START_FEN, { speeds: ['rapid', 'blitz'], ratings: [2000] }),
      lichess.fetch('masters', START_FEN),
      lichess.fetch('masters', AFTER_E4.fen),
    ]);
    expect(fake.maxActive).toBe(1);
    expect(seen[0]!.authorization).toBe('Bearer lip_test');
    expect(fake.calls[0]).toContain('/lichess?');
    expect(fake.calls[0]).toContain('speeds=blitz%2Crapid');
    expect(fake.calls[0]).toContain('ratings=2000');
    expect(fake.calls[1]).toMatch(/^\/masters\?/);
  });

  it('pauses a full minute after a 429 and says when it needs a token', async () => {
    let t = 1_000_000;
    const fake = fakeLichess();
    const lichess = new LichessExplorer({ token: 'x', fetch: fake.fetch, now: () => t });
    fake.setStatus(429);
    await expect(lichess.fetch('masters', START_FEN)).rejects.toMatchObject({ code: 'busy' });
    fake.setStatus(200);
    await expect(lichess.fetch('masters', START_FEN)).rejects.toMatchObject({ code: 'busy' });
    expect(fake.calls).toHaveLength(1);
    t += 61_000;
    await expect(lichess.fetch('masters', START_FEN)).resolves.toBeTruthy();

    const logs: string[] = [];
    const anon = new LichessExplorer({ fetch: fake.fetch, log: (m) => logs.push(m) });
    fake.setStatus(401);
    await expect(anon.fetch('masters', START_FEN)).rejects.toMatchObject({ code: 'not_configured' });
    expect(logs[0]).toContain('LICHESS_TOKEN');
  });
});

describe('ExplorerService', () => {
  let h: DbHandle;

  beforeAll(async () => {
    h = openDb({ path: 'memory://' });
    await h.migrate();
  });
  afterAll(() => h.close());

  it('fetches a position once, then serves it from memory and from the database', async () => {
    const fake = fakeLichess();
    const lichess = new LichessExplorer({ token: 'x', fetch: fake.fetch });
    const a = new ExplorerService({ db: h.db, lichess });
    const [r1, r2] = await Promise.all([a.position('masters', START_FEN), a.position('masters', START_FEN)]);
    expect(fake.calls).toHaveLength(1);
    expect(r1.position.moves.map((m) => m.san)).toEqual(['e4', 'd4', 'a3']);
    expect(r2).toEqual(r1);
    await a.position('masters', START_FEN.replace(' 0 1', ' 0 7'));
    expect(fake.calls).toHaveLength(1);
    // A restarted server finds it in the database.
    const b = new ExplorerService({ db: h.db, lichess });
    expect((await b.position('masters', START_FEN)).position.white).toBe(480);
    expect(fake.calls).toHaveLength(1);
    // Different filters are a different lookup.
    await b.position('lichess', START_FEN, { speeds: ['blitz'] });
    await b.position('lichess', START_FEN, { speeds: ['rapid'] });
    expect(fake.calls).toHaveLength(3);
  });

  it('serves an old answer when Lichess cannot answer, and an error when there is none', async () => {
    let t = Date.now();
    const fake = fakeLichess();
    const lichess = new LichessExplorer({ token: 'x', fetch: fake.fetch });
    const first = new ExplorerService({ db: h.db, lichess, now: () => t });
    await first.position('masters', AFTER_E4.fen);
    // 40 days on, the answer is out of date and Lichess is down.
    t += 40 * 86_400_000;
    fake.setStatus(500);
    const later = new ExplorerService({ db: h.db, lichess, now: () => t });
    const r = await later.position('masters', AFTER_E4.fen);
    expect(r.stale).toBe(true);
    expect(r.position.moves[0]!.san).toBe('c5');
    const fresh = new ExplorerService({ db: null, lichess, now: () => t });
    await expect(fresh.position('masters', AFTER_E4.fen)).rejects.toBeInstanceOf(ExplorerError);
    // No token and nothing cached: not set up.
    await expect(new ExplorerService({ db: null, lichess: null }).position('lichess', START_FEN)).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('counts theory plies from the masters games, and zero when they are out of reach', async () => {
    const fake = fakeLichess();
    const svc = new ExplorerService({ db: null, lichess: new LichessExplorer({ token: 'x', fetch: fake.fetch }) });
    // 1. e4 c5 are theory; the position after has no masters games here.
    expect(await svc.theoryPlies(START_FEN, ['e2e4', 'c7c5', 'g1f3'])).toBe(2);
    // 1. a3 has 5 games: not theory.
    expect(await svc.theoryPlies(START_FEN, ['a2a3'])).toBe(0);
    const calls = fake.calls.length;
    expect(await svc.theoryPlies(START_FEN, ['e2e4', 'c7c5', 'g1f3'])).toBe(2);
    expect(fake.calls.length).toBe(calls);
    const down = fakeLichess();
    down.setStatus(503);
    const off = new ExplorerService({ db: null, lichess: new LichessExplorer({ token: 'x', fetch: down.fetch }) });
    expect(await off.theoryPlies(START_FEN, ['e2e4'])).toBe(0);
  });
});

describe('ChessMate collection', () => {
  let h: DbHandle;

  beforeEach(async () => {
    h = openDb({ path: 'memory://' });
    await h.migrate();
  });

  async function playedGame(id: string, moves: string[], winner: 'w' | 'b' | null, endedAt: Date) {
    await createGame(h.db, {
      id,
      white: { id: 'u_w', name: 'w', rating: 1600 },
      black: { id: 'u_b', name: 'b', rating: 1800 },
      timeControl: { initialMs: 180_000, incrementMs: 0 },
      rated: true,
      initialFen: START_FEN,
    });
    const g = new Game(START_FEN);
    for (let i = 0; i < moves.length; i++) {
      const m = g.move(moves[i]!)!;
      await addMove(h.db, id, { ply: i + 1, uci: m.uci, san: m.san, fenAfter: g.fen });
    }
    await finishGame(h.db, id, {
      outcome: { result: winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2', reason: winner ? 'resignation' : 'draw_agreement', winner },
      pgn: '',
      finalFen: g.fen,
      plyCount: moves.length,
      endedAt,
    } as never);
  }

  it('counts finished games by position and move with results and ratings', async () => {
    const svc = new ExplorerService({ db: h.db });
    await svc.recordGame({ initialFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3'], winner: 'w', ratings: { w: 1500, b: 1700 } });
    await svc.recordGame({ initialFen: START_FEN, moves: ['e2e4', 'c7c5'], winner: null, ratings: null });
    await svc.recordGame({ initialFen: START_FEN, moves: ['d2d4', 'd7d5'], winner: 'b', ratings: { w: 2000, b: 2000 } });
    // Custom starts and one-move games are not counted.
    await svc.recordGame({ initialFen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', moves: ['e2e4', 'e8e7'], winner: 'w' });
    await svc.recordGame({ initialFen: START_FEN, moves: ['h2h4'], winner: 'w' });

    const start = (await svc.position('chessmate', START_FEN)).position;
    expect([start.white, start.draws, start.black]).toEqual([1, 1, 1]);
    expect(start.moves.map((m) => [m.san, m.white + m.draws + m.black, m.averageRating])).toEqual([
      ['e4', 2, 1600],
      ['d4', 1, 2000],
    ]);
    const e4 = (await svc.position('chessmate', AFTER_E4.fen)).position;
    expect(e4.moves.map((m) => m.san).sort()).toEqual(['c5', 'e5']);
    expect(e4.opening?.eco).toBeTruthy();
    // A new game shows up at once.
    await svc.recordGame({ initialFen: START_FEN, moves: ['e2e4', 'e7e5'], winner: 'b' });
    expect((await svc.position('chessmate', START_FEN)).position.moves[0]!.black).toBe(1);
  });

  it('backfills games that ended before it started, once, and never a game it counts live', async () => {
    const t0 = Date.now();
    await ensureUser(h.db, { id: 'u_w', username: 'w' });
    await ensureUser(h.db, { id: 'u_b', username: 'b' });
    await playedGame('old1', ['e2e4', 'e7e5', 'g1f3'], 'w', new Date(t0 - 60_000));
    await playedGame('old2', ['e2e4', 'c7c5'], null, new Date(t0 - 30_000));
    const svc = new ExplorerService({ db: h.db, now: () => t0 });
    // This one finishes after the server started: counted live, not by the backfill.
    await playedGame('live', ['d2d4', 'd7d5'], 'b', new Date(t0 + 5_000));
    await svc.recordGame({ initialFen: START_FEN, moves: ['d2d4', 'd7d5'], winner: 'b', ratings: { w: 1600, b: 1800 } });

    expect(await svc.backfill(0)).toBe(2);
    expect(await svc.backfill(0)).toBe(0);
    const again = new ExplorerService({ db: h.db, now: () => t0 + 100_000 });
    expect(await again.backfill(0)).toBe(0);
    const start = (await svc.position('chessmate', START_FEN.replace(' 0 1', ' 0 2'))).position;
    expect(start.moves.map((m) => [m.san, m.white + m.draws + m.black])).toEqual([
      ['e4', 2],
      ['d4', 1],
    ]);
  });
});

describe('explorer routes', () => {
  let http: Server;
  let base: string;
  const fake = fakeLichess();

  beforeAll(async () => {
    const svc = new ExplorerService({ db: null, lichess: new LichessExplorer({ token: 'x', fetch: fake.fetch }) });
    const route = explorerRoutes(svc, { perMinute: 8 });
    http = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!(await route(req, res, url))) res.writeHead(404).end();
    });
    await new Promise<void>((r) => http.listen(0, r));
    const addr = http.address();
    base = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(() => new Promise<void>((r) => http.close(() => r())));

  it('answers a position, theory, and bad requests', async () => {
    const ok = await fetch(`${base}/api/explorer?source=masters&fen=${encodeURIComponent(START_FEN)}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toContain('max-age');
    const body = (await ok.json()) as { position: { moves: { san: string }[] }; stale: boolean };
    expect(body.position.moves[0]!.san).toBe('e4');
    expect(body.stale).toBe(false);

    const theory = await fetch(`${base}/api/explorer/theory?moves=e2e4,c7c5,g1f3`);
    expect(await theory.json()).toEqual({ plies: 2 });

    expect((await fetch(`${base}/api/explorer?source=nope&fen=${encodeURIComponent(START_FEN)}`)).status).toBe(400);
    expect((await fetch(`${base}/api/explorer?source=masters&fen=garbage`)).status).toBe(400);
    expect((await fetch(`${base}/api/explorer/theory?moves=e2e4,zz`)).status).toBe(400);
    expect((await fetch(`${base}/api/explorer`, { method: 'POST' })).status).toBe(405);
  });

  it('limits lookups per address', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await fetch(`${base}/api/explorer?source=chessmate&fen=${encodeURIComponent(START_FEN)}`)).status;
    expect(last).toBe(429);
  });
});
