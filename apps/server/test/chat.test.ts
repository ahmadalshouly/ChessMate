import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ChessServer } from '../src/server';

const ADMIN = 'test-admin-token';
let server: ChessServer;
let port: number;

beforeAll(async () => {
  server = new ChessServer({ port: 0, matchIntervalMs: 20, adminToken: ADMIN });
  port = await server.listen();
});
afterAll(() => server.close());

function client(token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiters: [(m: ServerMessage) => boolean, (m: ServerMessage) => void][] = [];
  ws.on('message', (d) => {
    const m = decodeServer(String(d))!;
    const w = waiters.find((x) => x[0](m));
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w[1](m);
    } else inbox.push(m);
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
        waiters.push([(m) => m.t === t, res as never]);
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

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`http://localhost:${port}/admin${path}`, {
    ...init,
    headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

describe('chat and moderation over the wire', () => {
  it('relays filtered chat, files a report, and lets an admin chat-ban', async () => {
    const a = await client('dev:mod-alice:Alice');
    const b = await client('dev:mod-bob:Bob');
    await a.next('welcome');
    await b.next('welcome');
    const tc = { initialMs: 60_000, incrementMs: 0 };
    a.send({ t: 'seek', timeControl: tc, rated: false });
    b.send({ t: 'seek', timeControl: tc, rated: false });
    const [sa] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    const gameId = sa.game.gameId;

    b.send({ t: 'chat', gameId, text: 'you are a bitch' });
    const [ca, cb] = await Promise.all([a.next('chat'), b.next('chat')]);
    expect(ca.line).toMatchObject({ text: 'you are a b****', filtered: true, name: 'Bob' });
    expect(cb.line.id).toBe(ca.line.id);

    a.send({ t: 'chat', gameId, quick: 'good_luck' });
    expect((await b.next('chat')).line.text).toBe('Good luck!');
    await a.next('chat'); // own echo

    a.send({ t: 'report', playerId: 'mod-bob', gameId, reason: 'abusive_chat', note: 'insults' });
    const { reportId } = await a.next('reported');

    // Admin API: auth required, then list, then ban.
    expect((await fetch(`http://localhost:${port}/admin/reports`)).status).toBe(401);
    const list = (await (await admin('/reports')).json()) as { reports: { id: string; chat: { text: string }[] }[] };
    const rep = list.reports.find((r) => r.id === reportId)!;
    expect(rep.chat.map((l) => l.text)).toContain('you are a b****');
    const res = await admin(`/reports/${reportId}`, { method: 'POST', body: JSON.stringify({ action: 'chat_ban', durationHours: 1 }) });
    expect(((await res.json()) as { report: { status: string } }).report.status).toBe('actioned');

    b.send({ t: 'chat', gameId, text: 'hello again' });
    expect((await b.next('error')).code).toBe('chat_restricted');

    const bans = (await (await admin('/chat-bans')).json()) as { bans: { playerId: string }[] };
    expect(bans.bans.map((x) => x.playerId)).toContain('mod-bob');
    await admin('/chat-bans/mod-bob', { method: 'DELETE' });
    b.send({ t: 'chat', gameId, text: 'sorry' });
    expect((await a.next('chat')).line.text).toBe('sorry');

    // Outsiders cannot post into the game.
    const c = await client('guest:Eve');
    await c.next('welcome');
    c.send({ t: 'chat', gameId, text: 'hi' });
    expect((await c.next('error')).code).toBe('not_found');

    a.close();
    b.close();
    c.close();
  });

  it('disables the admin API without a token', async () => {
    const s = new ChessServer({ port: 0 });
    const p = await s.listen();
    expect((await fetch(`http://localhost:${p}/admin/reports`)).status).toBe(503);
    await s.close();
  });
});
