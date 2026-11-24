import { defaultNotificationPrefs, type CampaignInput } from '@chessmate/core';
import { createUser, openDb, schema, touchLastSeen, upsertPushToken, type DbHandle } from '@chessmate/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CampaignService } from '../src/notifications/campaigns';
import { MemoryNotificationStore, NotificationService, RecordingPushSender } from '../src/notifications';

let h: DbHandle;
let now = Date.UTC(2026, 10, 24, 12);
const ids: Record<string, string> = {};
let push: RecordingPushSender;
let store: MemoryNotificationStore;
let svc: CampaignService;
const foreground = new Set<string>();

const message = { title: 'Hi {username}', body: 'Come play', url: '/play', push: true, inbox: true };
const input = (over: Partial<CampaignInput> = {}) => ({ name: 'Test', kind: 'instant', message, audience: {}, scheduleAt: null, trigger: null, ...over });
const sentTo = () => push.sent.map((m) => m.to);
const settle = async () => {
  for (let i = 0; i < 50 && svc.list().some((c) => c.status === 'sending'); i++) await new Promise((r) => setTimeout(r, 10));
  await svc['opts'].notifications.flush();
};

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  for (const name of ['ana', 'ben', 'cat', 'dan']) ids[name] = (await createUser(h.db, { username: name, email: `${name}@example.com` })).id;
  // Production writes tokens through to the database (DbNotificationStore); the audience query reads them there.
  await upsertPushToken(h.db, { token: 'ExpoPushToken[ana]', userId: ids.ana!, platform: 'ios', updatedAt: new Date() });
  await upsertPushToken(h.db, { token: 'ExpoPushToken[ben]', userId: ids.ben!, platform: 'android', updatedAt: new Date() });
  // dan's account is closed: never targeted.
  await h.db.update(schema.users).set({ closedAt: new Date(now) }).where(eq(schema.users.id, ids.dan!));
});
afterAll(() => h.close());

beforeEach(async () => {
  await h.db.delete(schema.pushCampaigns);
  push = new RecordingPushSender();
  store = new MemoryNotificationStore();
  store.addPushToken({ token: 'ExpoPushToken[ana]', userId: ids.ana!, platform: 'ios', updatedAt: 0 });
  store.addPushToken({ token: 'ExpoPushToken[ben]', userId: ids.ben!, platform: 'android', updatedAt: 0 });
  store.addPushToken({ token: 'ExpoPushToken[dan]', userId: ids.dan!, platform: 'ios', updatedAt: 0 });
  const notifications = new NotificationService({ store, push, now: () => now, isOnline: (id) => foreground.has(id) });
  svc = new CampaignService({ db: h.db, notifications, now: () => now, log: () => {}, isForeground: (id) => foreground.has(id) });
  await svc.load();
});

describe('CampaignService', () => {
  it('sends now to every open account, personalised, once', async () => {
    const c = await svc.create(input(), 'staff', true);
    expect(c.status).toBe('sending');
    await settle();
    const done = svc.get(c.id);
    expect(done.status).toBe('sent');
    expect(sentTo().sort()).toEqual(['ExpoPushToken[ana]', 'ExpoPushToken[ben]']);
    expect(push.sent.find((m) => m.to === 'ExpoPushToken[ana]')).toMatchObject({ title: 'Hi ana', body: 'Come play', data: { url: '/play', kind: 'news', campaignId: c.id } });
    // cat has no phone: inbox only.
    expect(store.list(ids.cat!)[0]).toMatchObject({ title: 'Hi cat', kind: 'news' });
    expect(done.stats).toMatchObject({ targeted: 3, inbox: 3, pushed: 2, failed: 0 });
    await expect(svc.launch(c.id)).rejects.toThrow(/already sent/);
  });

  it('targets by platform and by username, and previews the audience', async () => {
    expect(await svc.preview({ platform: 'android' })).toMatchObject({ count: 1, sample: ['ben'] });
    expect((await svc.preview({})).count).toBe(3);
    expect((await svc.preview({})).withPush).toBe(2);
    expect((await svc.preview({ platform: 'web' })).sample).toEqual(['cat']);
    await svc.create(input({ audience: { usernames: ['@Ana'] } as never }), 'staff', true);
    await settle();
    expect(sentTo()).toEqual(['ExpoPushToken[ana]']);
  });

  it('respects a player who turned off news', async () => {
    const prefs = defaultNotificationPrefs();
    prefs.kinds.news = { inApp: true, push: false };
    store.savePrefs(ids.ana!, prefs);
    const c = await svc.create(input({ message: { ...message, inbox: false } }), 'staff', true);
    await settle();
    expect(sentTo()).toEqual(['ExpoPushToken[ben]']);
    expect(svc.get(c.id).stats.skipped).toBe(2); // ana opted out, cat has no phone
  });

  it('holds a scheduled campaign until its time', async () => {
    const c = await svc.create(input({ kind: 'scheduled', scheduleAt: now + 3_600_000 }), 'staff', true);
    expect(c.status).toBe('scheduled');
    await svc.tick();
    expect(push.sent).toHaveLength(0);
    now += 3_600_000;
    await svc.tick();
    await settle();
    expect(svc.get(c.id).status).toBe('sent');
    expect(push.sent).toHaveLength(2);
    await expect(svc.create(input({ kind: 'scheduled', scheduleAt: now - 3_600_000 }), 'staff', true)).rejects.toThrow(/passed/);
  });

  it('reminds a player who opened the app and left without playing, once per cooldown', async () => {
    const trigger = { event: 'left_without_playing', delayMinutes: 30, cooldownHours: 24, maxPerUser: 0, days: 3 };
    const c = await svc.create(input({ kind: 'trigger', trigger: trigger as never }), 'staff', true);
    expect(c.status).toBe('active');
    const leave = async (name: string, play = false) => {
      foreground.add(ids[name]!);
      svc.foreground(ids[name]!);
      if (play) svc.gameStarted(ids[name]!);
      foreground.delete(ids[name]!);
      svc.background(ids[name]!);
      await new Promise((r) => setTimeout(r, 20));
    };
    await leave('ana');
    await leave('ben', true);
    await svc.tick();
    expect(push.sent).toHaveLength(0); // not yet: 30 minutes
    now += 31 * 60_000;
    await svc.tick();
    await svc['opts'].notifications.flush();
    expect(sentTo()).toEqual(['ExpoPushToken[ana]']);

    // Leaves again an hour later: still inside the 24 h cooldown.
    now += 60 * 60_000;
    await leave('ana');
    now += 31 * 60_000;
    await svc.tick();
    expect(push.sent).toHaveLength(1);

    // Came back before the delay: nothing.
    now += 25 * 3_600_000;
    await leave('ana');
    foreground.add(ids.ana!);
    svc.foreground(ids.ana!);
    await new Promise((r) => setTimeout(r, 20));
    now += 31 * 60_000;
    await svc.tick();
    expect(push.sent).toHaveLength(1);
    foreground.delete(ids.ana!);

    await svc.pause(c.id);
    expect(svc.get(c.id).status).toBe('paused');
  });

  it('nudges players who have been away for N days, once per absence', async () => {
    await touchLastSeen(h.db, ids.ana!, new Date(now - 4 * 86_400_000));
    await touchLastSeen(h.db, ids.ben!, new Date(now - 3_600_000));
    await touchLastSeen(h.db, ids.cat!, new Date(now - 60 * 86_400_000)); // gone too long for an automatic nudge
    await svc.create(input({ kind: 'trigger', trigger: { event: 'inactive', days: 3, delayMinutes: 0, cooldownHours: 0, maxPerUser: 0 } as never }), 'staff', true);
    await svc.tick();
    await svc['opts'].notifications.flush();
    expect(sentTo()).toEqual(['ExpoPushToken[ana]']);
    now += 11 * 60_000;
    await svc.tick();
    expect(push.sent).toHaveLength(1);
  });

  it('refuses links to other sites and empty messages', async () => {
    await expect(svc.create(input({ message: { ...message, url: 'https://evil.example' } }), 's', false)).rejects.toThrow(/in-app path/);
    await expect(svc.create(input({ message: { ...message, title: ' ' } }), 's', false)).rejects.toThrow(/title/);
  });

  it('sends a test to the staff member only', async () => {
    const r = await svc.test(message, { id: ids.ben!, username: 'ben' });
    expect(r).toEqual({ devices: 1, push: 'sent' });
    expect(sentTo()).toEqual(['ExpoPushToken[ben]']);
  });
});
