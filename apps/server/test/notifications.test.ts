import { decodeServer, encode, inQuietHours, mergeNotificationPrefs, defaultNotificationPrefs, type ServerMessage } from '@chessmate/core';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  ExpoPushSender,
  MemoryNotificationStore,
  NotificationService,
  RecordingPushSender,
  SqliteNotificationStore,
  friendRequest,
  yourTurn,
  type NotificationStore,
} from '../src/notifications';
import { ChessServer } from '../src/server';

const TOKEN = 'ExponentPushToken[abc123]';

describe.each([
  ['memory', () => new MemoryNotificationStore()],
  ['sqlite', () => new SqliteNotificationStore(new DatabaseSync(':memory:'))],
] as const)('%s store', (_name, make: () => NotificationStore) => {
  it('stores, collapses, marks read and deletes', () => {
    const s = make();
    const svc = new NotificationService({ store: s, now: () => 1000 });
    svc.notify('u1', yourTurn({ gameId: 'g1', opponentName: 'Bob', san: 'e4' }));
    svc.notify('u1', yourTurn({ gameId: 'g1', opponentName: 'Bob', san: 'Nf3' }));
    const fr = svc.notify('u1', friendRequest({ fromId: 'u2', fromName: 'Bob' }))!;
    expect(s.unreadCount('u1')).toBe(2);
    expect(s.list('u1').map((n) => n.body)).toContain('Bob played Nf3');
    expect(s.markRead('u1', [fr.id], 2000)).toBe(1);
    expect(s.unreadCount('u1')).toBe(1);
    expect(s.markRead('u1', 'all', 2000)).toBe(1);
    expect(s.remove('u1', fr.id)).toBe(true);
    expect(s.remove('other', s.list('u1')[0]!.id)).toBe(false);
    expect(s.list('u1')).toHaveLength(1);
  });

  it('keeps prefs and push tokens per user', () => {
    const s = make();
    const p = mergeNotificationPrefs(defaultNotificationPrefs(), { kinds: { challenge: { push: false } } });
    s.savePrefs('u1', p);
    expect(s.prefs('u1').kinds.challenge).toEqual({ inApp: true, push: false });
    expect(s.prefs('u2').kinds.challenge.push).toBe(true);
    s.addPushToken({ token: TOKEN, userId: 'u1', platform: 'ios', updatedAt: 1 });
    s.removePushToken(TOKEN, 'u2');
    expect(s.pushTokens('u1')).toHaveLength(1);
    s.addPushToken({ token: TOKEN, userId: 'u2', platform: 'ios', updatedAt: 2 });
    expect(s.pushTokens('u1')).toHaveLength(0);
    expect(s.pushTokens('u2')).toHaveLength(1);
  });
});

describe('NotificationService', () => {
  it('follows preferences, skips push when online, drops dead tokens', async () => {
    const store = new MemoryNotificationStore();
    const push = new RecordingPushSender();
    let online = false;
    const svc = new NotificationService({ store, push, isOnline: () => online, now: () => Date.UTC(2026, 0, 1, 12) });
    store.addPushToken({ token: TOKEN, userId: 'u1', platform: 'android', updatedAt: 0 });
    svc.notify('u1', friendRequest({ fromId: 'u2', fromName: 'Bob' }));
    await svc.flush();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({ to: TOKEN, title: 'Friend request', badge: 1, data: { url: '/friends', kind: 'friend_request' } });

    online = true;
    svc.notify('u1', friendRequest({ fromId: 'u3', fromName: 'Cy' }));
    await svc.flush();
    expect(push.sent).toHaveLength(1);

    online = false;
    store.savePrefs('u1', mergeNotificationPrefs(store.prefs('u1'), { kinds: { friend_request: { inApp: false, push: false } } }));
    expect(svc.notify('u1', friendRequest({ fromId: 'u4', fromName: 'Di' }))).toBeNull();
    expect(store.unreadCount('u1')).toBe(2);

    push.invalid.add(TOKEN);
    svc.notify('u1', yourTurn({ gameId: 'g', opponentName: 'Bob' }));
    await svc.flush();
    expect(store.pushTokens('u1')).toHaveLength(0);
  });

  it('holds push during quiet hours but keeps the in-app copy', async () => {
    const store = new MemoryNotificationStore();
    const push = new RecordingPushSender();
    // 23:30 UTC, user in UTC+1 => 00:30 local, inside 22:00-07:00.
    const svc = new NotificationService({ store, push, now: () => Date.UTC(2026, 0, 1, 23, 30) });
    store.addPushToken({ token: TOKEN, userId: 'u1', platform: 'ios', updatedAt: 0 });
    store.savePrefs('u1', mergeNotificationPrefs(store.prefs('u1'), { quietHours: { enabled: true, tzOffsetMin: 60 } }));
    svc.notify('u1', friendRequest({ fromId: 'u2', fromName: 'Bob' }));
    await svc.flush();
    expect(push.sent).toHaveLength(0);
    expect(store.unreadCount('u1')).toBe(1);
  });

  it('cannot turn off system notifications', () => {
    const p = mergeNotificationPrefs(defaultNotificationPrefs(), { kinds: { system: { inApp: false, push: false } }, quietHours: { startMin: 9999 } });
    expect(p.kinds.system).toEqual({ inApp: true, push: true });
    expect(p.quietHours.startMin).toBe(22 * 60);
  });

  it('computes quiet hours across midnight', () => {
    const q = { enabled: true, startMin: 22 * 60, endMin: 7 * 60, tzOffsetMin: 0 };
    expect(inQuietHours(q, Date.UTC(2026, 0, 1, 23))).toBe(true);
    expect(inQuietHours(q, Date.UTC(2026, 0, 1, 6, 59))).toBe(true);
    expect(inQuietHours(q, Date.UTC(2026, 0, 1, 7))).toBe(false);
    expect(inQuietHours({ ...q, startMin: 9 * 60, endMin: 17 * 60 }, Date.UTC(2026, 0, 1, 12))).toBe(true);
  });
});

describe('ExpoPushSender', () => {
  it('chunks by 100 and reports DeviceNotRegistered tokens', async () => {
    const bodies: unknown[][] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const msgs = JSON.parse(String(init.body)) as { to: string }[];
      bodies.push(msgs);
      const data = msgs.map((m) =>
        m.to.endsWith('[dead]') ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' },
      );
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;
    const sender = new ExpoPushSender({ fetch: fakeFetch });
    const msgs = Array.from({ length: 150 }, (_, i) => ({ to: i === 7 ? 'ExpoPushToken[dead]' : `ExpoPushToken[${i}]`, title: 't', body: 'b' }));
    const r = await sender.send(msgs);
    expect(bodies.map((b) => b.length)).toEqual([100, 50]);
    expect(r).toEqual({ sent: 149, failed: 1, invalidTokens: ['ExpoPushToken[dead]'] });
  });
});

describe('HTTP API and realtime delivery', () => {
  let server: ChessServer;
  let base: string;
  let port: number;
  const push = new RecordingPushSender();
  const auth = { authorization: 'Bearer dev:alice:Alice', 'content-type': 'application/json' };

  beforeAll(async () => {
    server = new ChessServer({ port: 0, matchIntervalMs: 20, notifications: new NotificationService({ store: new MemoryNotificationStore(), push }) });
    port = await server.listen();
    base = `http://localhost:${port}`;
  });
  afterAll(() => server.close());

  it('rejects requests without a valid token', async () => {
    expect((await fetch(`${base}/api/notifications`)).status).toBe(401);
    const pre = await fetch(`${base}/api/notifications`, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('registers a push token, updates prefs, lists and reads', async () => {
    expect((await fetch(`${base}/api/push-tokens`, { method: 'POST', headers: auth, body: JSON.stringify({ token: 'nope' }) })).status).toBe(400);
    expect((await fetch(`${base}/api/push-tokens`, { method: 'POST', headers: auth, body: JSON.stringify({ token: TOKEN, platform: 'ios' }) })).status).toBe(200);

    const prefs = await (await fetch(`${base}/api/notifications/prefs`, { method: 'PUT', headers: auth, body: JSON.stringify({ kinds: { challenge: { push: false } } }) })).json();
    expect(prefs.kinds.challenge).toEqual({ inApp: true, push: false });

    await fetch(`${base}/api/notifications/test`, { method: 'POST', headers: auth });
    await server.notifications.flush();
    expect(push.sent.at(-1)).toMatchObject({ to: TOKEN, title: 'Test notification' });

    const list = await (await fetch(`${base}/api/notifications`, { headers: auth })).json();
    expect(list.unread).toBe(1);
    expect(list.notifications[0].kind).toBe('system');
    const read = await (await fetch(`${base}/api/notifications/read`, { method: 'POST', headers: auth, body: JSON.stringify({ all: true }) })).json();
    expect(read.unread).toBe(0);
    const del = await fetch(`${base}/api/notifications/${list.notifications[0].id}`, { method: 'DELETE', headers: auth });
    expect(del.status).toBe(200);
  });

  it('delivers live over the socket and pushes "your turn" only when the player is away', async () => {
    const connect = (token: string) =>
      new Promise<{ ws: WebSocket; inbox: ServerMessage[] }>((res) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        const inbox: ServerMessage[] = [];
        ws.on('message', (d) => inbox.push(decodeServer(String(d))!));
        ws.on('open', () => {
          ws.send(encode({ t: 'hello', v: 1, token }));
          res({ ws, inbox });
        });
      });
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
      expect(cond()).toBe(true);
    };

    const w = await connect('dev:white1:White');
    const b = await connect('dev:black1:Black');
    await until(() => w.inbox.some((m) => m.t === 'welcome') && b.inbox.some((m) => m.t === 'welcome'));

    // Live delivery: a friend request reaches the open socket.
    server.notifications.notify('black1', friendRequest({ fromId: 'white1', fromName: 'White' }));
    await until(() => b.inbox.some((m) => m.t === 'notification'));

    const tc = { initialMs: 300_000, incrementMs: 0 };
    w.ws.send(encode({ t: 'seek', timeControl: tc, rated: false }));
    b.ws.send(encode({ t: 'seek', timeControl: tc, rated: false }));
    await until(() => w.inbox.some((m) => m.t === 'gameStart'));
    const start = w.inbox.find((m) => m.t === 'gameStart') as Extract<ServerMessage, { t: 'gameStart' }>;
    // White moves while Black has closed the app.
    const [mover, away, awayId] = start.you === 'w' ? [w, b, 'black1'] : [b, w, 'white1'];
    server.notifications.store.addPushToken({ token: 'ExpoPushToken[away]', userId: awayId, platform: 'android', updatedAt: 0 });
    away.ws.close();
    await until(() => away.ws.readyState === WebSocket.CLOSED);
    await new Promise((r) => setTimeout(r, 50));
    const before = push.sent.length;
    mover.ws.send(encode({ t: 'move', gameId: start.game.gameId, uci: 'e2e4', ply: 0 }));
    await until(() => push.sent.length > before);
    await server.notifications.flush();
    expect(push.sent.at(-1)).toMatchObject({ to: 'ExpoPushToken[away]', title: 'Your turn', data: { kind: 'your_turn', gameId: start.game.gameId } });
    mover.ws.close();
  });
});
