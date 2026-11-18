import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ChessServer } from '../src/server';

let server: ChessServer;
let port: number;

beforeAll(async () => {
  server = new ChessServer({ port: 0, matchIntervalMs: 20, reconnectGraceMs: 300 });
  port = await server.listen();
});
afterAll(() => server.close());

function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const all: ServerMessage[] = [];
  const inbox: ServerMessage[] = [];
  const waiters: [(m: ServerMessage) => boolean, (m: ServerMessage) => void][] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    all.push(m);
    const w = waiters.find((x) => x[0](m));
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w[1](m);
    } else inbox.push(m);
  });
  const api = {
    all,
    send: (m: ClientMessage) => ws.send(encode(m)),
    next: <T extends ServerMessage['t']>(t: T, pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) =>
      new Promise<Extract<ServerMessage, { t: T }>>((res, rej) => {
        const match = (m: ServerMessage) => m.t === t && pred(m as never);
        const found = inbox.find(match);
        if (found) {
          inbox.splice(inbox.indexOf(found), 1);
          return res(found as never);
        }
        const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), 2000);
        waiters.push([match, (m) => (clearTimeout(timer), res(m as never))]);
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

const tc = { initialMs: 120_000, incrementMs: 0 };

describe('Secret Queen games', () => {
  it('pairs only Secret Queen seekers, keeps each secret private, and reveals on a queen move', async () => {
    const a = await client('guest:SqA');
    const b = await client('guest:SqB');
    const c = await client('guest:Standard');
    await Promise.all([a.next('welcome'), b.next('welcome'), c.next('welcome')]);

    c.send({ t: 'seek', timeControl: tc, rated: false });
    a.send({ t: 'seek', timeControl: tc, rated: true, variant: 'secretQueen' });
    b.send({ t: 'seek', timeControl: tc, rated: false, variant: 'secretQueen' });
    const [sa, sb] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    expect(sa.game.variant).toBe('secretQueen');
    expect(sa.game.rated).toBe(false);
    expect(sa.game.gameId).toBe(sb.game.gameId);
    const gameId = sa.game.gameId;
    const [white, black] = sa.you === 'w' ? [a, b] : [b, a];

    // No move before a pick.
    white.send({ t: 'move', gameId, uci: 'e2e4', ply: 0 });
    expect((await white.next('error')).code).toBe('secret_required');

    white.send({ t: 'secretPick', gameId, square: 'e2' });
    expect(await white.next('secretPicked', (m) => !!m.square)).toMatchObject({ color: 'w', square: 'e2' });
    const seen = await black.next('secretPicked');
    expect(seen.square).toBeUndefined();

    black.send({ t: 'secretPick', gameId, square: 'a7' });
    await black.next('secretPicked', (m) => m.square === 'a7');

    white.send({ t: 'move', gameId, uci: 'e2e4', ply: 0 });
    const m1 = await black.next('moved');
    expect(m1.reveals).toBeUndefined();
    black.send({ t: 'move', gameId, uci: 'a7a6', ply: 1 });
    await white.next('moved', (m) => m.ply === 2);

    // A rejoin snapshot gives each player only their own secret.
    black.send({ t: 'join', gameId });
    const snapB = await black.next('gameStart', (m) => m.game.moves.length === 2);
    expect(snapB.game.secretQueen).toMatchObject({ yours: 'a6', picked: { w: true, b: true }, reveals: [] });
    white.send({ t: 'join', gameId });
    const snapW = await white.next('gameStart', (m) => m.game.moves.length === 2);
    expect(snapW.game.secretQueen?.yours).toBe('e4');

    // The hidden queen moves like a queen and shows itself.
    white.send({ t: 'move', gameId, uci: 'e4h7', ply: 2 });
    const m3 = await black.next('moved', (m) => m.ply === 3);
    expect(m3.san).toBe('Qxh7');
    expect(m3.reveals).toEqual([{ ply: 2, color: 'w', square: 'e4', cause: 'moved' }]);

    // Nothing black received ever named white's hidden square before the reveal.
    const leaked = black.all.some((m) => (m.t === 'secretPicked' && m.color === 'w' && m.square) || ((m.t === 'gameStart' || m.t === 'gameState') && m.game.secretQueen?.yours === 'e4'));
    expect(leaked).toBe(false);

    white.send({ t: 'resign', gameId });
    const over = await black.next('secretReveal');
    expect(over.reveals).toEqual([{ ply: 3, color: 'b', square: 'a6', cause: 'gameEnd' }]);
    for (const x of [a, b, c]) x.close();
  });
});
