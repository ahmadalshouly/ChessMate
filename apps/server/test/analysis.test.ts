import { decodeServer, encode, type ClientMessage, type ServerMessage, type GameReview, type UciInfo } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AnalysisService, EnginePool, type Engine, type SearchOptions, type SearchResult } from '../src/engine';
import { ChessServer } from '../src/server';

/** Deterministic stand-in for Stockfish: always prefers the first legal-looking move it is told about. */
class FakeEngine implements Engine {
  alive = true;
  searches: string[] = [];
  async search(fen: string, opts: SearchOptions, onInfo?: (i: UciInfo) => void, signal?: AbortSignal): Promise<SearchResult> {
    this.searches.push(fen);
    const lines = new Map<number, UciInfo>();
    const best = fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8') ? 'e2e4' : fen.includes(' b ') ? 'e7e5' : 'g1f3';
    for (let pv = 1; pv <= opts.multipv; pv++) {
      const info: UciInfo = { depth: 10, multipv: pv, score: { cp: 25 - pv * 10 }, pv: [best] };
      lines.set(pv, info);
      onInfo?.(info);
    }
    await new Promise((r) => setTimeout(r, signal?.aborted ? 0 : 5));
    return { lines, bestMove: best };
  }
  close() {
    this.alive = false;
  }
}

let server: ChessServer;
let port: number;
const engine = new FakeEngine();

beforeAll(async () => {
  const analysis = new AnalysisService(new EnginePool(async () => engine, 1), { updateIntervalMs: 0 });
  server = new ChessServer({ port: 0, matchIntervalMs: 20, analysis });
  port = await server.listen();
});
afterAll(() => server.close());

async function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiters: { match: (m: ServerMessage) => boolean; res: (m: ServerMessage) => void }[] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    const w = waiters.find((x) => x.match(m));
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w.res(m);
    } else inbox.push(m);
  });
  await new Promise((r) => ws.on('open', r));
  const api = {
    send: (m: ClientMessage) => ws.send(encode(m)),
    next: (match: (m: ServerMessage) => boolean) =>
      new Promise<ServerMessage>((res) => {
        const i = inbox.findIndex(match);
        if (i >= 0) return res(inbox.splice(i, 1)[0]!);
        waiters.push({ match, res });
      }),
    close: () => ws.close(),
  };
  api.send({ t: 'hello', v: 1, token });
  await api.next((m) => m.t === 'welcome');
  return api;
}

describe('engine analysis over the game socket', () => {
  it('streams analysis with SAN lines', async () => {
    const a = await client('guest:Analyst');
    a.send({ t: 'analyze', id: 1, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', multipv: 2 });
    const done = (await a.next((m) => m.t === 'analysis' && m.done)) as Extract<ServerMessage, { t: 'analysis' }>;
    expect(done.id).toBe(1);
    expect(done.analysis.lines).toHaveLength(2);
    expect(done.analysis.lines[0]!.san).toEqual(['e4']);
    a.close();
  });

  it('answers finished positions without the engine', async () => {
    const a = await client('guest:Analyst');
    const before = engine.searches.length;
    a.send({ t: 'analyze', id: 2, fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3' });
    const m = (await a.next((x) => x.t === 'analysis')) as Extract<ServerMessage, { t: 'analysis' }>;
    expect(m.analysis.terminal).toBe('checkmate');
    expect(engine.searches.length).toBe(before);
    a.close();
  });

  it('reviews a game move by move', async () => {
    const a = await client('guest:Reviewer');
    a.send({ t: 'review', id: 3, moves: ['e2e4', 'e7e5', 'g1f3'] });
    const progress = (await a.next((m) => m.t === 'reviewProgress')) as Extract<ServerMessage, { t: 'reviewProgress' }>;
    expect(progress.total).toBe(4);
    const r = (await a.next((m) => m.t === 'reviewResult')) as Extract<ServerMessage, { t: 'reviewResult' }>;
    expect(r.review.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(r.review.moves[0]!.judgement.classification).toBe('book');
    a.close();
  });

  it('rejects illegal move lists', async () => {
    const a = await client('guest:Reviewer');
    a.send({ t: 'review', id: 4, moves: ['e2e5'] });
    const e = (await a.next((m) => m.t === 'error')) as Extract<ServerMessage, { t: 'error' }>;
    expect(e).toMatchObject({ code: 'bad_request', id: 4 });
    a.close();
  });

  it('is locked during a live game, for the player and for the live position', async () => {
    const a = await client('guest:Alice');
    const b = await client('guest:Bob');
    const spy = await client('guest:Spy');
    const tc = { initialMs: 60_000, incrementMs: 0 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const start = (await a.next((m) => m.t === 'gameStart')) as Extract<ServerMessage, { t: 'gameStart' }>;
    await b.next((m) => m.t === 'gameStart');
    const white = start.you === 'w' ? a : b;
    white.send({ t: 'move', gameId: start.game.gameId, uci: 'e2e4', ply: 0 });
    await a.next((m) => m.t === 'moved');

    a.send({ t: 'analyze', id: 5, fen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1' });
    expect(await a.next((m) => m.t === 'error')).toMatchObject({ code: 'engine_locked', id: 5 });
    a.send({ t: 'review', id: 6, moves: [], gameId: start.game.gameId });
    expect(await a.next((m) => m.t === 'error')).toMatchObject({ code: 'engine_locked', id: 6 });

    // Someone else asking about the exact live position is refused too.
    spy.send({ t: 'analyze', id: 7, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' });
    expect(await spy.next((m) => m.t === 'error')).toMatchObject({ code: 'engine_locked', id: 7 });

    // After the game ends, the review is available.
    a.send({ t: 'resign', gameId: start.game.gameId });
    await a.next((m) => m.t === 'gameOver');
    a.send({ t: 'review', id: 8, moves: [], gameId: start.game.gameId });
    const r = (await a.next((m) => m.t === 'reviewResult')) as Extract<ServerMessage, { t: 'reviewResult' }>;
    expect(r.review.moves.map((m) => m.uci)).toEqual(['e2e4']);
    for (const c of [a, b, spy]) c.close();
  });
});

describe('without an engine', () => {
  it('reports engine_unavailable', async () => {
    const bare = new ChessServer({ port: 0 });
    const p = await bare.listen();
    const ws = new WebSocket(`ws://localhost:${p}/ws`);
    await new Promise((r) => ws.on('open', r));
    const got = new Promise<ServerMessage>((res) =>
      ws.on('message', (d) => {
        const m = decodeServer(String(d))!;
        if (m.t === 'error') res(m);
      }),
    );
    ws.send(encode({ t: 'hello', v: 1, token: 'guest:X' }));
    ws.send(encode({ t: 'analyze', id: 1, fen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1' }));
    expect(await got).toMatchObject({ code: 'engine_unavailable', id: 1 });
    ws.close();
    await bare.close();
  });
});

describe('stored reviews', () => {
  const memoryStore = () => {
    const rows = new Map<string, { review: GameReview; gameId?: string }>();
    return {
      rows,
      get: async (k: string) => rows.get(k)?.review,
      put: async (k: string, review: GameReview, gameId?: string) => void rows.set(k, { review, gameId }),
    };
  };
  const collect = () => {
    const sent: ServerMessage[] = [];
    return { sent, send: (m: ServerMessage) => void sent.push(m) };
  };
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('reviews finished games in the background and answers Review from the store', async () => {
    const store = memoryStore();
    const fake = new FakeEngine();
    const svc = new AnalysisService(new EnginePool(async () => fake, 2), { store });
    await svc.precompute({ gameId: 'g1', moves, initialFen: START });
    expect([...store.rows.values()][0]!.gameId).toBe('g1');
    expect(fake.searches).toHaveLength(moves.length + 1);

    // A fresh service (a restart) reads it back without touching the engine.
    const fresh = new FakeEngine();
    const after = new AnalysisService(new EnginePool(async () => fresh, 1), { store });
    const { sent, send } = collect();
    const r = await after.review('p1', { id: 1, moves, initialFen: START }, send);
    expect(r?.moves.map((m) => m.uci)).toEqual(moves);
    expect(fresh.searches).toHaveLength(0);
    expect(sent.map((m) => m.t)).toEqual(['reviewResult']);
    svc.close();
    after.close();
  });

  it('joins a background review that is still running instead of starting again', async () => {
    const store = memoryStore();
    const fake = new FakeEngine();
    const svc = new AnalysisService(new EnginePool(async () => fake, 2), { store });
    const bg = svc.precompute({ gameId: 'g2', moves, initialFen: START });
    await new Promise((r) => setTimeout(r, 1));
    const { sent, send } = collect();
    const r = await svc.review('p1', { id: 9, moves, initialFen: START, gameId: 'g2' }, send);
    await bg;
    expect(r?.moves).toHaveLength(moves.length);
    expect(fake.searches).toHaveLength(moves.length + 1);
    expect(sent.at(-1)).toMatchObject({ t: 'reviewResult', id: 9 });
    expect(sent.some((m) => m.t === 'reviewProgress')).toBe(true);
    expect(store.rows.size).toBe(1);
    svc.close();
  });

  it('keeps a background review going when the player leaves', async () => {
    const store = memoryStore();
    const svc = new AnalysisService(new EnginePool(async () => new FakeEngine(), 1), { store });
    const bg = svc.precompute({ gameId: 'g3', moves, initialFen: START });
    await new Promise((r) => setTimeout(r, 1));
    const pending = svc.review('p1', { id: 1, moves, initialFen: START }, () => {});
    svc.cancel('p1');
    expect(await pending).toBeNull();
    await bg;
    expect(store.rows.size).toBe(1);
    svc.close();
  });
});
