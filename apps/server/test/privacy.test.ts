import { DEFAULT_SETTINGS, decodeServer, encode, type ClientMessage, type ServerMessage, type UserSettings } from '@chessmate/core';
import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ChessServer } from '../src/server';
import { DbProfileStore } from '../src/profiles';
import { SocialService } from '../src/social/service';

type Privacy = UserSettings['privacy'];

let h: DbHandle;
let social: SocialService;
let server: ChessServer;
let port: number;
const ids: Record<string, string> = {};
const privacy = new Map<string, Partial<Privacy>>();
const setPrivacy = (name: string, p: Partial<Privacy>) => privacy.set(ids[name]!, p);

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  for (const name of ['ann', 'ben', 'cat', 'dan', 'eli']) {
    ids[name] = (await createUser(h.db, { username: name, displayName: name })).id;
  }
  social = new SocialService(h.db, { privacyOf: (id) => ({ ...DEFAULT_SETTINGS.privacy, ...privacy.get(id) }) });
  server = new ChessServer({ port: 0, matchIntervalMs: 20, social });
  port = await server.listen();
  // ann and ben are friends, ben and cat are friends: ann and cat are friends of friends.
  await api('ann', 'POST', 'requests', { userId: ids.ben });
  await api('ben', 'POST', `requests/${ids.ann}/accept`);
  await api('ben', 'POST', 'requests', { userId: ids.cat });
  await api('cat', 'POST', `requests/${ids.ben}/accept`);
}, 30_000);
afterAll(async () => {
  await server.close();
  await h.close();
});
beforeEach(() => privacy.clear());

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


describe('privacy settings are enforced by the server', () => {
  it('friend requests: nobody, friends of friends, everyone', async () => {
    setPrivacy('cat', { friendRequests: 'nobody' });
    expect((await api('ann', 'POST', 'requests', { userId: ids.cat })).status).toBe(403);

    setPrivacy('cat', { friendRequests: 'friendsOfFriends' });
    expect((await api('dan', 'POST', 'requests', { userId: ids.cat })).body.error).toBe('Only friends of friends can send this player a request');
    expect((await api('ann', 'POST', 'requests', { userId: ids.cat })).body).toEqual({ status: 'sent' });
    await api('ann', 'DELETE', `requests/${ids.cat}`);

    // A request they already sent you can still be answered by sending one back.
    setPrivacy('dan', { friendRequests: 'nobody' });
    await api('dan', 'POST', 'requests', { userId: ids.eli });
    expect((await api('eli', 'POST', 'requests', { userId: ids.dan })).body).toEqual({ status: 'accepted' });
  });

  it('search and follows', async () => {
    setPrivacy('cat', { searchable: false, allowFollows: false });
    expect((await api('dan', 'GET', 'search?q=ca')).body).toEqual([]);
    // Friends can still find them.
    expect((await api('ben', 'GET', 'search?q=ca')).body.map((u: any) => u.username)).toEqual(['cat']);
    expect((await api('dan', 'PUT', `following/${ids.cat}`)).status).toBe(403);
    privacy.clear();
    expect((await api('dan', 'PUT', `following/${ids.cat}`)).status).toBe(200);
  });

  it('hides online status from friends when it is turned off', async () => {
    setPrivacy('ann', { showOnline: false });
    const ann = await client(tok('ann'));
    await ann.next('welcome');
    const friends = (await api('ben', 'GET', 'friends')).body;
    expect(friends.find((f: any) => f.user.username === 'ann').presence).toEqual({ status: 'offline' });
    expect((await api('ben', 'GET', `users/${ids.ann}`)).body.presence).toEqual({ status: 'offline' });
    privacy.clear();
    expect((await api('ben', 'GET', `users/${ids.ann}`)).body.presence).toEqual({ status: 'online' });
    ann.close();
  });

  it('challenges: nobody, friends only, everyone', async () => {
    const [ann, ben, dan] = await Promise.all([client(tok('ann')), client(tok('ben')), client(tok('dan'))]);
    await Promise.all([ann.next('welcome'), ben.next('welcome'), dan.next('welcome')]);
    const tc = { initialMs: 180_000, incrementMs: 0 };

    setPrivacy('ann', { challenges: 'nobody' });
    ben.send({ t: 'challengeCreate', to: ids.ann, timeControl: tc, rated: false, color: 'random' });
    expect((await ben.next('error')).message).toBe('This player does not accept challenges');

    setPrivacy('ann', { challenges: 'friends' });
    dan.send({ t: 'challengeCreate', to: ids.ann, timeControl: tc, rated: false, color: 'random' });
    expect((await dan.next('error')).message).toBe('Only friends can challenge this player');
    ben.send({ t: 'challengeCreate', to: ids.ann, timeControl: tc, rated: false, color: 'random' });
    expect((await ann.next('challenge')).challenge.from.id).toBe(ids.ben);
    for (const c of [ann, ben, dan]) c.close();
  });

  it('spectators: only friends may watch when set to friends', async () => {
    const [ann, eli, ben, dan] = await Promise.all([client(tok('ann')), client(tok('eli')), client(tok('ben')), client(tok('dan'))]);
    await Promise.all([ann.next('welcome'), eli.next('welcome'), ben.next('welcome'), dan.next('welcome')]);
    setPrivacy('ann', { spectators: 'friends' });
    const tc = { initialMs: 240_000, incrementMs: 0 };
    ann.send({ t: 'seek', timeControl: tc, rated: false });
    eli.send({ t: 'seek', timeControl: tc, rated: false });
    const { game } = await ann.next('gameStart');
    dan.send({ t: 'watch', gameId: game.gameId });
    expect((await dan.next('error')).code).toBe('forbidden');
    ben.send({ t: 'watch', gameId: game.gameId });
    expect((await ben.next('gameState')).game.gameId).toBe(game.gameId);
    for (const c of [ann, eli, ben, dan]) c.close();
  });
});

describe('profile settings storage', () => {
  it('keeps settings in the database across restarts', async () => {
    const store = await DbProfileStore.load(h.db);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.privacy.friendRequests = 'friendsOfFriends';
    settings.privacy.showOnline = false;
    await store.save({ userId: ids.ann!, displayName: 'Ann', bio: null, country: 'DE', avatar: { id: 'king', tone: 'ink' }, settings, updatedAt: 1 });
    const reloaded = await DbProfileStore.load(h.db);
    expect(reloaded.get(ids.ann!)).toMatchObject({ displayName: 'Ann', country: 'DE', settings: { privacy: { friendRequests: 'friendsOfFriends', showOnline: false } } });
    await reloaded.delete(ids.ann!);
    expect((await DbProfileStore.load(h.db)).get(ids.ann!)).toBeUndefined();
  });
});
