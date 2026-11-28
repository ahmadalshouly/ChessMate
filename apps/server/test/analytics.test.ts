import { createUser, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsService, analyticsRoutes } from '../src/analytics';
import { ChessServer } from '../src/server';

let h: DbHandle;
let server: ChessServer;
let base: string;
let analytics: AnalyticsService;
let userId: string;

beforeAll(async () => {
  h = openDb({ url: process.env.TEST_DATABASE_URL ?? '', path: 'memory://' });
  await h.migrate();
  userId = (await createUser(h.db, { username: 'tracked' })).id;
  analytics = new AnalyticsService({ db: h.db, log: () => undefined });
  server = new ChessServer({ port: 0, http: [analyticsRoutes(analytics, (t) => (t === 'good' ? userId : null))] });
  base = `http://localhost:${await server.listen()}`;
});
afterAll(async () => {
  await server.close();
  await h.close();
});

const post = async (path: string, body: unknown, token?: string) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as Record<string, number> };
};

const batch = (deviceId: string, events: unknown[]) => ({ deviceId, sessionId: 'session-abc1', platform: 'ios', appVersion: '0.1.0', lang: 'de', events });

describe('analytics API', () => {
  it('keeps valid events, links the account and never fails the app', async () => {
    const r = await post('/api/events', batch('device-1234', [{ name: 'app_open', at: Date.now() }, { name: 'nope' }, { name: 'game_start', at: Date.now(), props: { rated: true } }]), 'good');
    expect(r).toEqual({ status: 200, data: { kept: 2 } });
    expect((await post('/api/events', { junk: true })).data.kept).toBe(0);
    const report = await analytics.report(7);
    expect(report.app.devices).toBe(1);
    expect(report.app.recent.every((e) => e.username === 'tracked')).toBe(true);
    expect(report.app.languages).toEqual([{ key: 'de', count: 1 }]);
  });

  it('forgets a device', async () => {
    await post('/api/events', batch('device-5678', [{ name: 'app_open', at: Date.now() }]));
    expect((await post('/api/events/forget', { deviceId: 'device-5678' })).data.deleted).toBe(1);
  });

  it('limits how much one address can send', async () => {
    const events = Array.from({ length: 50 }, () => ({ name: 'screen_view', at: Date.now(), screen: '/' }));
    let kept = 0;
    for (let i = 0; i < 6; i++) kept += (await post('/api/events', batch('device-flood', events))).data.kept!;
    expect(kept).toBeLessThan(300);
  });
});
