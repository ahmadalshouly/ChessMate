import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ChessServer } from '../src/server';

let server: ChessServer;
let port: number;

beforeAll(async () => {
  server = new ChessServer({ port: 0, matchIntervalMs: 20 });
  port = await server.listen();
});
afterAll(() => server.close());

function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiters: [(m: ServerMessage) => boolean, (m: ServerMessage) => void][] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    inbox.push(m);
    for (const w of [...waiters]) if (w[0](m)) waiters.splice(waiters.indexOf(w), 1) && w[1](m);
  });
  const api = {
    send: (m: ClientMessage) => ws.send(encode(m)),
    next: <T extends ServerMessage['t']>(t: T) =>
      new Promise<Extract<ServerMessage, { t: T }>>((res) => {
        const found = inbox.find((m) => m.t === t);
        if (found) {
          inbox.splice(inbox.indexOf(found), 1);
          return res(found as never);
        }
        waiters.push([(m) => m.t === t && (inbox.splice(inbox.indexOf(m), 1), true), res as never]);
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

describe('ChessServer', () => {
  it('matches two players and plays a game to checkmate', async () => {
    const a = await client('guest:Alice');
    const b = await client('guest:Bob');
    await a.next('welcome');
    await b.next('welcome');
    const tc = { initialMs: 60_000, incrementMs: 0 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const [sa, sb] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    const white = sa.you === 'w' ? a : b;
    const black = sa.you === 'w' ? b : a;
    expect(sa.game.gameId).toBe(sb.game.gameId);
    const id = sa.game.gameId;
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    for (let i = 0; i < moves.length; i++) {
      (i % 2 === 0 ? white : black).send({ t: 'move', gameId: id, uci: moves[i]!, ply: i });
      await white.next('moved');
      await black.next('moved');
    }
    const over = await white.next('gameOver');
    expect(over.outcome).toMatchObject({ reason: 'checkmate', winner: 'b' });
    // Casual game: no rating change, and the client is told why.
    expect(over.ratingChange).toBeUndefined();
    expect(over.unrated).toBe('casual');
    a.close();
    b.close();
  });

  it('rejects illegal moves and resyncs', async () => {
    const a = await client('guest:Carol');
    const b = await client('guest:Dave');
    const tc = { initialMs: 180_000, incrementMs: 2_000 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const sa = await a.next('gameStart');
    const black = sa.you === 'b' ? a : b;
    black.send({ t: 'move', gameId: sa.game.gameId, uci: 'e7e5', ply: 0 });
    const e = await black.next('error');
    expect(e.code).toBe('not_your_turn');
    const state = await black.next('gameState');
    expect(state.game.moves).toEqual([]);
    a.close();
    b.close();
  });
});
