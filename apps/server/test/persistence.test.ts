import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { getGame, getRatings, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DbGamePersistence, DbPlayerStore, loadRatingsInto } from '../src/persistence';
import { MemoryRatingRepository, RatingService } from '../src/ratingService';
import { ChessServer } from '../src/server';

let h: DbHandle;
let server: ChessServer;
let persistence: DbGamePersistence;
let port: number;

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  persistence = new DbGamePersistence(h.db);
  const store = await DbPlayerStore.load(h.db, persistence);
  server = new ChessServer({ port: 0, matchIntervalMs: 20, store, persistence });
  port = await server.listen();
});
afterAll(async () => {
  await server.close();
  await h.close();
});

function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiters: [string, (m: ServerMessage) => void][] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    const w = waiters.find((x) => x[0] === m.t);
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w[1](m);
    } else inbox.push(m);
  });
  const api = {
    send: (m: ClientMessage) => ws.send(encode(m)),
    next: <T extends ServerMessage['t']>(t: T) =>
      new Promise<Extract<ServerMessage, { t: T }>>((res) => {
        const i = inbox.findIndex((m) => m.t === t);
        if (i >= 0) return res(inbox.splice(i, 1)[0] as never);
        waiters.push([t, res as never]);
      }),
    close: () => ws.close(),
  };
  return new Promise<typeof api>((res) =>
    ws.on('open', () => {
      api.send({ t: 'hello', v: 1, token });
      res(api);
    }),
  );
}

describe('game persistence', () => {
  it('saves a rated game, its moves, PGN and both rating changes', async () => {
    const a = await client('dev:alice-1:Alice');
    const b = await client('dev:bob-1:Bob');
    await a.next('welcome');
    await b.next('welcome');
    const tc = { initialMs: 180_000, incrementMs: 2_000 };
    a.send({ t: 'seek', timeControl: tc, rated: true });
    b.send({ t: 'seek', timeControl: tc, rated: true });
    const [sa] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    const white = sa.you === 'w' ? a : b;
    const black = sa.you === 'w' ? b : a;
    const id = sa.game.gameId;
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    for (let i = 0; i < moves.length; i++) {
      (i % 2 === 0 ? white : black).send({ t: 'move', gameId: id, uci: moves[i]!, ply: i });
      await white.next('moved');
      await black.next('moved');
    }
    const over = await white.next('gameOver');
    expect(over.ratingChange).toBeDefined();
    await persistence.flush();

    const g = await getGame(h.db, id);
    expect(g).toMatchObject({ status: 'finished', result: '0-1', endReason: 'checkmate', rated: true, timeCategory: 'blitz', plyCount: 4 });
    expect([g!.whiteUserId, g!.blackUserId].sort()).toEqual(['alice-1', 'bob-1']);
    expect(g!.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(g!.pgn).toContain('[Result "0-1"]');
    expect(g!.pgn).toContain('Qh4#');
    expect(g!.blackRatingAfter).toBeGreaterThan(1500);

    const blackId = g!.blackUserId!;
    const [r] = await getRatings(h.db, blackId);
    expect(r).toMatchObject({ category: 'blitz', games: 1, wins: 1 });

    // A restarted server sees the saved rating.
    const reloaded = await DbPlayerStore.load(h.db, persistence);
    expect(reloaded.get(blackId)?.ratings.blitz?.rating).toBeCloseTo(r!.rating);
    // ...and so does the rating service used for pairing, profiles and the next game.
    const repo = new MemoryRatingRepository();
    expect(await loadRatingsInto(repo, h.db)).toBeGreaterThanOrEqual(2);
    const svc = new RatingService(repo);
    const warm = svc.get(blackId, 'blitz', Date.now());
    expect(warm.rating).toBeCloseTo(r!.rating);
    expect(warm).toMatchObject({ games: 1, wins: 1 });
    a.close();
    b.close();
  });

  it('saves guest games with names and no account link', async () => {
    const a = await client('guest:Gina');
    const b = await client('guest:Hal');
    const tc = { initialMs: 60_000, incrementMs: 0 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const sa = await a.next('gameStart');
    a.send({ t: 'abort', gameId: sa.game.gameId });
    await a.next('gameOver');
    await persistence.flush();
    const g = await getGame(h.db, sa.game.gameId);
    expect(g).toMatchObject({ status: 'aborted', whiteUserId: null, blackUserId: null });
    expect([g!.whiteName, g!.blackName].sort()).toEqual(['Gina', 'Hal']);
    a.close();
    b.close();
  });
});
