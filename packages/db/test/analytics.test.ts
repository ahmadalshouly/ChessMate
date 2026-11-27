import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyticsReport, createUser, deleteAnalyticsDevice, insertAnalyticsEvents, openDb, pruneAnalyticsEvents, type DbHandle } from '../src';

let h: DbHandle;
beforeAll(async () => {
  h = openDb({ url: process.env.TEST_DATABASE_URL ?? '', path: 'memory://' });
  await h.migrate();
});
afterAll(() => h.close());

describe('analytics', () => {
  it('reports database facts and consented app events', async () => {
    const now = new Date();
    const u = await createUser(h.db, { username: 'counted' });
    const ev = (name: string, deviceId: string, sessionId: string, minsAgo: number, extra: Record<string, unknown> = {}) => ({
      name,
      deviceId,
      sessionId,
      at: new Date(now.getTime() - minsAgo * 60_000),
      platform: 'android',
      ...extra,
    });
    await insertAnalyticsEvents(h.db, [
      ev('app_open', 'device-aaaa', 'session-1', 30, { lang: 'de', appVersion: '0.1.0' }),
      ev('screen_view', 'device-aaaa', 'session-1', 29, { screen: '/play/online' }),
      ev('game_start', 'device-aaaa', 'session-1', 20, { userId: u.id, props: { rated: true } }),
      ev('game_end', 'device-aaaa', 'session-1', 10, { userId: u.id }),
      ev('app_open', 'device-bbbb', 'session-2', 5, { platform: 'web' }),
    ]);
    const r = await analyticsReport(h.db, { now, days: 7 });
    expect(r.totals.signups).toBeGreaterThanOrEqual(1);
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)?.signups).toBeGreaterThanOrEqual(1);
    expect(r.app.devices).toBe(2);
    expect(r.app.sessions).toBe(2);
    expect(r.app.funnel).toEqual({ opened: 2, signedUp: 0, startedGame: 1, finishedGame: 1 });
    expect(r.app.screens).toEqual([{ key: '/play/online', count: 1, devices: 1 }]);
    expect(r.app.platforms.map((p) => p.key).sort()).toEqual(['android', 'web']);
    expect(r.app.medianSessionSeconds).toBeGreaterThanOrEqual(0);
    expect(r.app.recent[0]?.name).toBe('app_open');
    expect(r.app.recent.find((e) => e.name === 'game_start')?.username).toBe('counted');
    expect(r.signupMethods.length).toBeGreaterThan(0);
  });

  it('forgets a device and prunes old events', async () => {
    await insertAnalyticsEvents(h.db, [{ name: 'app_open', deviceId: 'device-old', sessionId: 'session-old', at: new Date(Date.now() - 500 * 86400_000), platform: 'ios' }]);
    expect(await pruneAnalyticsEvents(h.db, new Date(Date.now() - 400 * 86400_000))).toBe(1);
    expect(await deleteAnalyticsDevice(h.db, 'device-bbbb')).toBe(1);
  });
});
