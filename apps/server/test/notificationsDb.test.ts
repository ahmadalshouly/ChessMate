import { defaultNotificationPrefs } from '@chessmate/core';
import { createUser, deleteUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbNotificationStore, NOTIFICATION_RETENTION_MS } from '../src/notifications/dbStore';
import { MAX_PER_USER, type StoredNotification } from '../src/notifications/store';

let h: DbHandle;
let alice: string;
let bob: string;

const note = (userId: string, i: number, extra: Partial<StoredNotification> = {}): StoredNotification => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  userId,
  kind: 'system',
  title: `Title ${i}`,
  body: `Body ${i}`,
  url: '/notifications',
  data: { n: String(i) },
  collapseKey: null,
  createdAt: Date.now() - 1_000_000 + i,
  readAt: null,
  ...extra,
});

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  alice = (await createUser(h.db, { username: 'alice', email: 'alice@example.com' })).id;
  bob = (await createUser(h.db, { username: 'bob', email: 'bob@example.com' })).id;
});
afterAll(async () => {
  await h.close();
});

describe('DbNotificationStore', () => {
  it('keeps the inbox, read state, preferences and push tokens across a restart', async () => {
    const a = await DbNotificationStore.load(h.db);
    a.add(note(alice, 1));
    a.add(note(alice, 2));
    a.add(note(bob, 3));
    a.markRead(alice, [note(alice, 1).id], Date.now());
    a.remove(bob, note(bob, 3).id);
    const prefs = defaultNotificationPrefs();
    prefs.kinds.challenge = { inApp: true, push: false };
    a.savePrefs(alice, prefs);
    a.addPushToken({ token: 'ExponentPushToken[a]', userId: alice, platform: 'ios', updatedAt: Date.now() });
    a.addPushToken({ token: 'ExponentPushToken[b]', userId: bob, platform: 'android', updatedAt: Date.now() });
    a.removePushToken('ExponentPushToken[b]', bob);
    await a.flush();

    const b = await DbNotificationStore.load(h.db);
    expect(b.list(alice).map((n) => n.title)).toEqual(['Title 2', 'Title 1']);
    expect(b.list(alice)[1]!.readAt).not.toBeNull();
    expect(b.list(alice)[0]!.data).toEqual({ n: '2' });
    expect(b.unreadCount(alice)).toBe(1);
    expect(b.list(bob)).toEqual([]);
    expect(b.prefs(alice).kinds.challenge).toEqual({ inApp: true, push: false });
    expect(b.pushTokens(alice).map((t) => t.token)).toEqual(['ExponentPushToken[a]']);
    expect(b.pushTokens(bob)).toEqual([]);
  });

  it('replaces unread notifications with the same collapse key in the database too', async () => {
    const a = await DbNotificationStore.load(h.db);
    a.add(note(bob, 10, { collapseKey: 'turn:g1' }));
    a.add(note(bob, 11, { collapseKey: 'turn:g1' }));
    await a.flush();
    const b = await DbNotificationStore.load(h.db);
    expect(b.list(bob).map((n) => n.title)).toEqual(['Title 11']);
  });

  it('keeps at most MAX_PER_USER per user and drops ones past retention', async () => {
    const u = (await createUser(h.db, { username: 'carol', email: 'carol@example.com' })).id;
    const a = await DbNotificationStore.load(h.db);
    a.add(note(u, 500, { createdAt: Date.now() - NOTIFICATION_RETENTION_MS - 60_000 }));
    for (let i = 0; i < MAX_PER_USER + 5; i++) a.add(note(u, 1000 + i));
    await a.flush();
    const b = await DbNotificationStore.load(h.db);
    const list = b.list(u, { limit: 1000 });
    expect(list).toHaveLength(MAX_PER_USER);
    expect(list[0]!.title).toBe(`Title ${1000 + MAX_PER_USER + 4}`);
    expect(list.some((n) => n.title === 'Title 500')).toBe(false);
  });

  it('ignores ids without an account and removes rows when the account is deleted', async () => {
    const logs: string[] = [];
    const a = await DbNotificationStore.load(h.db, { log: (m) => logs.push(m) });
    a.add(note('dev-only-player', 20));
    expect(a.list('dev-only-player')).toHaveLength(1);
    await a.flush();
    expect(logs).toEqual([]);

    await deleteUser(h.db, alice);
    const b = await DbNotificationStore.load(h.db);
    expect(b.list(alice)).toEqual([]);
    expect(b.pushTokens(alice)).toEqual([]);
  });
});
