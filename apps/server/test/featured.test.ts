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
  const waiters: [string, (m: ServerMessage) => void][] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    const w = waiters.find(([t]) => t === m.t);
    if (w) waiters.splice(waiters.indexOf(w), 1)[0]![1](m);
    else inbox.push(m);
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

const featured = async () => (await (await fetch(`http://localhost:${port}/api/live/featured`)).json()) as { game: { gameId: string; ply: number } | null };

describe('featured live game', () => {
  it('is empty with no games, then features a live game and sticks to it', async () => {
    expect((await featured()).game).toBeNull();

    const a = await client('guest:Fern');
    const b = await client('guest:Gus');
    await Promise.all([a.next('welcome'), b.next('welcome')]);
    const tc = { initialMs: 300_000, incrementMs: 0 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const sa = await a.next('gameStart');
    const white = sa.you === 'w' ? a : b;
    white.send({ t: 'move', gameId: sa.game.gameId, uci: 'e2e4', ply: 0 });
    await white.next('moved');

    const first = (await featured()).game;
    expect(first).toMatchObject({ gameId: sa.game.gameId, ply: 1 });
    expect((await featured()).game?.gameId).toBe(first?.gameId);

    // Anyone can then watch it over the socket.
    const viewer = await client('guest:Viewer');
    await viewer.next('welcome');
    viewer.send({ t: 'watch', gameId: sa.game.gameId });
    expect((await viewer.next('gameState')).game.moves).toEqual(['e2e4']);

    white.send({ t: 'resign', gameId: sa.game.gameId });
    await white.next('gameOver');
    expect((await featured()).game).toBeNull();
    for (const c of [a, b, viewer]) c.close();
  });
});
