import { decodeServer, encode, type ClientMessage, type ServerMessage } from '@chessmate/core';
import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ChessServer } from '../src/server';
import { SocialService } from '../src/social/service';

let h: DbHandle;
let social: SocialService;
let server: ChessServer;
let port: number;
const ids: Record<string, string> = {};

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  for (const name of ['alice', 'bob', 'carol', 'dave', 'eve', 'frank']) {
    ids[name] = (await createUser(h.db, { username: name, displayName: name[0]!.toUpperCase() + name.slice(1) })).id;
  }
  social = new SocialService(h.db);
  server = new ChessServer({ port: 0, matchIntervalMs: 20, social });
  port = await server.listen();
}, 30_000);
afterAll(async () => {
  await server.close();
  await h.close();
});

const tok = (name: string) => `dev:${ids[name]}:${name}`;

async function api(name: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://localhost:${port}/api/social/${path}`, {
    method,
    headers: { ...(name ? { authorization: `Bearer ${tok(name)}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

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
    next: <T extends ServerMessage['t']>(t: T, pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) =>
      new Promise<Extract<ServerMessage, { t: T }>>((res, rej) => {
        const match = (m: ServerMessage) => m.t === t && pred(m as never);
        const found = inbox.find(match);
        if (found) {
          inbox.splice(inbox.indexOf(found), 1);
          return res(found as never);
        }
        const timer = setTimeout(() => rej(new Error(`timed out waiting for ${t}`)), 3000);
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

describe('social API', () => {
  it('rejects anonymous calls and unknown routes', async () => {
    expect((await api(null, 'GET', 'friends')).status).toBe(401);
    expect((await api('alice', 'GET', 'nope')).status).toBe(404);
    expect((await api('alice', 'PATCH', 'friends')).status).toBe(405);
  });

  it('searches by username prefix without returning yourself', async () => {
    const r = await api('alice', 'GET', 'search?q=A');
    expect(r.status).toBe(200);
    expect(r.body.map((u: any) => u.username)).toEqual([]);
    const b = await api('alice', 'GET', 'search?q=b');
    expect(b.body[0]).toMatchObject({ username: 'bob', displayName: 'Bob', relationship: { friend: false, request: null } });
  });

  it('sends, lists, and accepts friend requests', async () => {
    expect((await api('alice', 'POST', 'requests', { userId: ids.bob })).body).toEqual({ status: 'sent' });
    expect((await api('alice', 'POST', 'requests', { userId: ids.alice })).status).toBe(400);
    const reqs = await api('bob', 'GET', 'requests');
    expect(reqs.body.incoming.map((r: any) => r.user.username)).toEqual(['alice']);
    expect((await api('alice', 'GET', 'requests')).body.outgoing.map((r: any) => r.user.username)).toEqual(['bob']);
    expect((await api('bob', 'GET', `users/${ids.alice}`)).body.relationship.request).toBe('incoming');

    expect((await api('bob', 'POST', `requests/${ids.alice}/accept`)).status).toBe(200);
    const friends = await api('alice', 'GET', 'friends');
    expect(friends.body.map((f: any) => f.user.username)).toEqual(['bob']);
    expect(friends.body[0].presence).toEqual({ status: 'offline' });
    expect((await api('alice', 'POST', 'requests', { userId: ids.bob })).status).toBe(409);
  });

  it('auto-accepts when both sides ask, and supports decline and cancel', async () => {
    await api('carol', 'POST', 'requests', { userId: ids.dave });
    expect((await api('dave', 'POST', 'requests', { userId: ids.carol })).body).toEqual({ status: 'accepted' });

    await api('carol', 'POST', 'requests', { userId: ids.eve });
    expect((await api('eve', 'POST', `requests/${ids.carol}/decline`)).status).toBe(200);
    expect((await api('eve', 'POST', `requests/${ids.carol}/accept`)).status).toBe(404);

    await api('carol', 'POST', 'requests', { userId: ids.frank });
    expect((await api('carol', 'DELETE', `requests/${ids.frank}`)).status).toBe(200);
    expect((await api('frank', 'GET', 'requests')).body.incoming).toEqual([]);
  });

  it('follows one way', async () => {
    expect((await api('eve', 'PUT', `following/${ids.alice}`)).status).toBe(200);
    expect((await api('alice', 'GET', 'followers')).body.map((f: any) => f.user.username)).toEqual(['eve']);
    const rel = (await api('alice', 'GET', `users/${ids.eve}`)).body.relationship;
    expect(rel).toMatchObject({ following: false, followsYou: true });
  });

  it('blocking severs ties, hides the blocker, and is reversible', async () => {
    await api('frank', 'POST', 'requests', { userId: ids.eve });
    await api('eve', 'POST', `requests/${ids.frank}/accept`);
    await api('frank', 'PUT', `following/${ids.eve}`);

    expect((await api('eve', 'PUT', `blocks/${ids.frank}`)).status).toBe(200);
    expect((await api('eve', 'GET', 'friends')).body).toEqual([]);
    expect((await api('frank', 'GET', 'following')).body).toEqual([]);
    expect((await api('eve', 'GET', 'blocks')).body.map((b: any) => b.user.username)).toEqual(['frank']);
    // Frank can't find, friend, follow or view Eve.
    expect((await api('frank', 'GET', 'search?q=ev')).body).toEqual([]);
    expect((await api('frank', 'POST', 'requests', { userId: ids.eve })).status).toBe(404);
    expect((await api('frank', 'PUT', `following/${ids.eve}`)).status).toBe(404);
    expect((await api('frank', 'GET', `users/${ids.eve}`)).status).toBe(404);
    // Eve must unblock before befriending.
    expect((await api('eve', 'POST', 'requests', { userId: ids.frank })).status).toBe(409);

    await api('eve', 'DELETE', `blocks/${ids.frank}`);
    expect((await api('frank', 'GET', 'search?q=ev')).body.map((u: any) => u.username)).toEqual(['eve']);
  });

  it('builds a feed from friends and followed players', async () => {
    const feed = await api('alice', 'GET', 'feed');
    const kinds = feed.body.items.map((i: any) => i.kind);
    expect(kinds).toContain('friendship');
    expect(feed.body.items.find((i: any) => i.kind === 'friendship')).toMatchObject({ a: { username: 'bob' }, b: { username: 'alice' } });
    // Carol and Dave's friendship is not in Alice's network.
    expect(feed.body.items.some((i: any) => i.kind === 'friendship' && i.a.username === 'dave')).toBe(false);
  });
});

describe('presence and spectating', () => {
  it('pushes presence to friends, lists live games, lets friends watch, and records the result', async () => {
    const bob = await client(tok('bob'));
    await bob.next('welcome');
    const alice = await client(tok('alice'));
    await alice.next('welcome');
    expect(await bob.next('presence', (m) => m.userId === ids.alice)).toMatchObject({ presence: { status: 'online' } });

    // Alice plays Carol; Bob sees her go into a game.
    const carol = await client(tok('carol'));
    await carol.next('welcome');
    const tc = { initialMs: 60_000, incrementMs: 0 };
    alice.send({ t: 'seek', timeControl: tc, rated: false });
    carol.send({ t: 'seek', timeControl: tc, rated: false });
    const start = await alice.next('gameStart');
    const gameId = start.game.gameId;
    const p = await bob.next('presence', (m) => m.userId === ids.alice && m.presence.status === 'playing');
    expect(p.presence.gameId).toBe(gameId);

    const live = await api('bob', 'GET', 'live');
    expect(live.body.map((g: any) => g.gameId)).toEqual([gameId]);

    bob.send({ t: 'watch', gameId });
    expect((await bob.next('gameState')).game.gameId).toBe(gameId);
    expect((await alice.next('watching')).spectators).toBe(1);

    const white = start.you === 'w' ? alice : carol;
    const black = start.you === 'w' ? carol : alice;
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    for (let i = 0; i < moves.length; i++) {
      (i % 2 === 0 ? white : black).send({ t: 'move', gameId, uci: moves[i]!, ply: i });
      expect((await bob.next('moved')).uci).toBe(moves[i]);
    }
    expect((await bob.next('gameOver')).outcome.reason).toBe('checkmate');
    await bob.next('presence', (m) => m.userId === ids.alice && m.presence.status === 'online');

    await expect.poll(async () => (await api('bob', 'GET', 'feed')).body.items.some((i: any) => i.kind === 'game' && i.gameId === gameId)).toBe(true);
    for (const c of [alice, bob, carol]) c.close();
  });

  it('refuses spectators who are blocked by a player', async () => {
    const dave = await client(tok('dave'));
    const frank = await client(tok('frank'));
    const eve = await client(tok('eve'));
    await Promise.all([dave.next('welcome'), frank.next('welcome'), eve.next('welcome')]);
    await api('dave', 'PUT', `blocks/${ids.eve}`);
    const tc = { initialMs: 120_000, incrementMs: 0 };
    dave.send({ t: 'seek', timeControl: tc, rated: false });
    frank.send({ t: 'seek', timeControl: tc, rated: false });
    const { game } = await dave.next('gameStart');
    eve.send({ t: 'watch', gameId: game.gameId });
    expect((await eve.next('error')).code).toBe('forbidden');
    for (const c of [dave, frank, eve]) c.close();
  });
});
