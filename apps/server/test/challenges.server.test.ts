import { decodeServer, encode, parseInvite, inviteUrl, type ClientMessage, type ServerMessage } from '@chessmate/core';
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

const tc = { initialMs: 300_000, incrementMs: 3_000 };

describe('challenges over the wire', () => {
  it('direct challenge: target sees it, accepts, both start with the chosen colours', async () => {
    const a = await client('dev:alice1:Alice');
    const b = await client('dev:bob1:Bob');
    await a.next('welcome');
    await b.next('welcome');
    a.send({ t: 'challengeCreate', to: 'bob1', timeControl: tc, rated: true, color: 'b' });
    const mine = await a.next('challenge');
    const theirs = await b.next('challenge');
    expect(theirs.challenge.id).toBe(mine.challenge.id);
    expect(theirs.challenge).toMatchObject({ from: { id: 'alice1' }, to: { id: 'bob1' }, rated: true, color: 'b' });

    b.send({ t: 'challengeAccept', id: theirs.challenge.id });
    const [sa, sb] = await Promise.all([a.next('gameStart'), b.next('gameStart')]);
    expect(sa.you).toBe('b');
    expect(sb.you).toBe('w');
    expect(sa.game.rated).toBe(true);
    expect(sa.game.timeControl).toEqual(tc);
    expect((await a.next('challengeGone')).reason).toBe('accepted');
    expect((await b.next('challengeGone')).reason).toBe('accepted');
    a.send({ t: 'resign', gameId: sa.game.gameId });
    await a.next('gameOver');
    a.close();
    b.close();
  });

  it('decline and cancel notify both sides', async () => {
    const a = await client('dev:alice2:Alice');
    const b = await client('dev:bob2:Bob');
    await a.next('welcome');
    await b.next('welcome');
    a.send({ t: 'challengeCreate', to: 'bob2', timeControl: tc, rated: false, color: 'random' });
    const c1 = (await b.next('challenge')).challenge;
    await a.next('challenge');
    b.send({ t: 'challengeDecline', id: c1.id });
    expect(await a.next('challengeGone')).toMatchObject({ id: c1.id, reason: 'declined' });
    await b.next('challengeGone');

    a.send({ t: 'challengeCreate', to: 'bob2', timeControl: tc, rated: false, color: 'w' });
    const c2 = (await b.next('challenge')).challenge;
    await a.next('challenge');
    a.send({ t: 'challengeCancel', id: c2.id });
    expect(await b.next('challengeGone')).toMatchObject({ id: c2.id, reason: 'cancelled' });
    a.close();
    b.close();
  });

  it('open invite link: a guest opens the link, sees the details, accepts', async () => {
    const host = await client('dev:host3:Host');
    await host.next('welcome');
    host.send({ t: 'challengeCreate', timeControl: tc, rated: true, color: 'w' });
    const { challenge } = await host.next('challenge');
    expect(challenge.to).toBeNull();
    const link = inviteUrl('https://chessmate.example', challenge.id);
    const id = parseInvite(link)!;
    expect(id).toBe(challenge.id);

    const guest = await client('guest:Friend');
    await guest.next('welcome');
    guest.send({ t: 'challengeGet', id });
    expect((await guest.next('challenge')).challenge).toMatchObject({ id, from: { name: 'Host' } });
    guest.send({ t: 'challengeAccept', id });
    const [sh, sg] = await Promise.all([host.next('gameStart'), guest.next('gameStart')]);
    expect(sh.you).toBe('w');
    expect(sg.you).toBe('b');
    // A guest can never play rated.
    expect(sh.game.rated).toBe(false);

    // A second visitor cannot take the same invite, but can see it led to a game.
    const late = await client('guest:Late');
    await late.next('welcome');
    late.send({ t: 'challengeAccept', id });
    expect((await late.next('error')).code).toBe('not_found');
    late.send({ t: 'challengeGet', id });
    expect((await late.next('challenge')).challenge).toMatchObject({ status: 'accepted', gameId: sh.game.gameId });
    host.send({ t: 'abort', gameId: sh.game.gameId });
    await host.next('gameOver');
    host.close();
    guest.close();
    late.close();
  });

  it('refuses to start when the challenger is offline, and delivers pending challenges on login', async () => {
    const a = await client('dev:alice4:Alice');
    const b0 = await client('dev:bob4:Bob');
    await a.next('welcome');
    await b0.next('welcome');
    b0.close();
    await new Promise((r) => setTimeout(r, 50));
    a.send({ t: 'challengeCreate', to: 'bob4', timeControl: tc, rated: false, color: 'w' });
    const c = (await a.next('challenge')).challenge;
    a.close();
    await new Promise((r) => setTimeout(r, 50));

    const b = await client('dev:bob4:Bob');
    await b.next('welcome');
    expect((await b.next('challenge')).challenge.id).toBe(c.id);
    b.send({ t: 'challengeAccept', id: c.id });
    expect(await b.next('error')).toMatchObject({ code: 'offline' });
    b.close();
  });

  it('rejects challenges to unknown players and bad ids', async () => {
    const a = await client('dev:alice5:Alice');
    await a.next('welcome');
    a.send({ t: 'challengeCreate', to: 'nobody', timeControl: tc, rated: false, color: 'w' });
    expect((await a.next('error')).code).toBe('not_found');
    a.send({ t: 'challengeAccept', id: '../etc' });
    expect((await a.next('error')).code).toBe('bad_request');
    a.close();
  });
});
