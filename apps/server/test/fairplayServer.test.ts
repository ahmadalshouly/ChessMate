import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ChessServer } from '../src/server';

const TOKEN = 'test-admin-token';
let server: ChessServer;
let port: number;

beforeAll(async () => {
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    fairPlay: { adminToken: TOKEN, analyzer: null, log: () => {} },
    rateLimits: { messages: { burst: 15, perSecond: 1 } },
  });
  port = await server.listen();
});
afterAll(() => server.close());

function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerMessage[] = [];
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
  ws.on('message', (d) => inbox.push(decodeServer(String(d))!));
  const api = {
    send: (m: ClientMessage | Record<string, unknown>) => ws.send(encode(m as ClientMessage)),
    async next<T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>> {
      for (let i = 0; i < 200; i++) {
        const idx = inbox.findIndex((m) => m.t === t);
        if (idx >= 0) return inbox.splice(idx, 1)[0] as never;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`timed out waiting for ${t}`);
    },
    closed,
    close: () => ws.close(),
  };
  return new Promise<typeof api>((res) =>
    ws.on('open', () => {
      api.send({ t: 'hello', v: 1, token });
      res(api);
    }),
  );
}

const admin = (path: string, init: RequestInit = {}, token = TOKEN) =>
  fetch(`http://localhost:${port}/admin/fairplay${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  });

describe('fair play on the game server', () => {
  it('rejects malformed moves and promotion suffixes on normal moves', async () => {
    const a = await client('dev:fp-a:Ann');
    const b = await client('dev:fp-b:Ben');
    const tc = { initialMs: 180_000, incrementMs: 0 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const sa = await a.next('gameStart');
    await b.next('gameStart');
    const white = sa.you === 'w' ? a : b;
    const id = sa.game.gameId;
    white.send({ t: 'move', gameId: id, uci: 'e2e4', ply: '0' } as never);
    expect((await white.next('error')).message).toMatch(/ply/i);
    white.send({ t: 'move', gameId: id, uci: 'e2e4q', ply: 0 });
    expect((await white.next('error')).code).toBe('illegal_move');
    white.send({ t: 'move', gameId: id, uci: 'e2e4', ply: 0 });
    await white.next('moved');
    expect(server.getRoom(id)!.rejectedMoves.w).toBe(1);
    a.close();
    b.close();
  });

  it('rate-limits message floods', async () => {
    const c = await client('dev:fp-flood:Flood');
    await c.next('welcome');
    for (let i = 0; i < 30; i++) c.send({ t: 'ping', id: i });
    const e = await c.next('error');
    expect(e.code).toBe('rate_limited');
    c.close();
  });

  it('admin API needs the token', async () => {
    expect((await admin('/queue', {}, 'wrong')).status).toBe(401);
    expect((await admin('/queue')).status).toBe(200);
  });

  it('report, review, ban over HTTP takes the account out of online play', async () => {
    const c = await client('dev:fp-cheat:Cheater');
    expect((await c.next('welcome')).restricted ?? null).toBeNull();
    expect((await admin('/players/fp-cheat/report', { method: 'POST', body: JSON.stringify({ note: 'suspicious' }) })).status).toBe(200);
    const queue = (await (await admin('/queue')).json()) as { cases: { playerId: string }[] };
    expect(queue.cases.map((x) => x.playerId)).toContain('fp-cheat');
    expect((await admin('/players/fp-cheat/ban', { method: 'POST', body: '{}' })).status).toBe(400);
    expect((await admin('/players/fp-cheat/ban', { method: 'POST', body: JSON.stringify({ reason: 'engine use' }) })).status).toBe(200);
    // The player stays connected but is told the account is restricted, and cannot start games.
    expect((await c.next('restricted')).reason).toBe('fair_play');
    c.send({ t: 'seek', timeControl: { initialMs: 60_000, incrementMs: 0 }, rated: false });
    expect((await c.next('error')).code).toBe('account_restricted');
    c.close();

    const again = await client('dev:fp-cheat:Cheater');
    expect((await again.next('welcome')).restricted).toBe('fair_play');
    again.send({ t: 'ping', id: 1 });
    await again.next('pong');
    again.close();

    const file = (await (await admin('/players/fp-cheat')).json()) as { ban: { reason: string }; case: { status: string } };
    expect(file.ban.reason).toBe('engine use');
    expect(file.case.status).toBe('banned');
  });
});
