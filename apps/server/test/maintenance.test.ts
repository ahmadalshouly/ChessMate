import { openDb, listAudit, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/admin';
import { MaintenanceSwitch, maintenanceRoutes } from '../src/admin/maintenance';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { ChessServer } from '../src/server';

const SECRET = 'test-secret-test-secret-test-secret!';

let h: DbHandle;
let auth: AuthService;
let server: ChessServer;
let base: string;
let clock = 1_800_000_000_000;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

async function call(as: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/admin${path}`, {
    method,
    headers: {
      authorization: `Bearer ${tokens[as]}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>,
  };
}

const status = async () => {
  const res = await fetch(`${base}/api/maintenance`);
  expect(res.headers.get('cache-control')).toBe('no-store');
  return (await res.json()) as Record<string, any>;
};

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({
    store: new DbAuthStore(h.db),
    mailer: new ConsoleMailer(),
    secret: SECRET,
  });
  for (const u of ['owner', 'mod']) {
    const r = await auth.signup({
      username: u,
      email: `${u}@example.com`,
      password: 'correct horse battery',
    });
    tokens[u] = r.tokens.accessToken;
    ids[u] = r.user.id;
  }
  const admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner']);
  const maintenance = await new MaintenanceSwitch(h.db, () => clock).load();
  admin.maintenance = maintenance;
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    http: [authRoutes(auth, { rateLimit: false }), maintenanceRoutes(maintenance)],
    resolveUser: (t) => auth.verifyAccessToken(t)?.userId ?? null,
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
  await call('owner', 'POST', `/players/${ids.mod}/role`, {
    role: 'moderator',
  });
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('web maintenance mode', () => {
  it('is off until an admin switches it on', async () => {
    expect(await status()).toEqual({
      active: false,
      title: '',
      description: '',
      endsAt: null,
      autoEnd: false,
    });
  });

  it('only admins can read or change it', async () => {
    expect((await call('mod', 'GET', '/maintenance')).status).toBe(403);
    expect((await call('mod', 'POST', '/maintenance', { active: true })).status).toBe(403);
    expect((await call('owner', 'POST', '/maintenance', { active: 'yes' })).status).toBe(400);
    expect((await call('owner', 'POST', '/maintenance', { endsAt: 'soon' })).status).toBe(400);
    expect((await status()).active).toBe(false);
  });

  it('shows the title, text and countdown, logs it, and survives a restart', async () => {
    const endsAt = clock + 3_600_000;
    const r = await call('owner', 'POST', '/maintenance', {
      active: true,
      title: '  Launch day  ',
      description: 'Opening at noon.',
      endsAt,
    });
    expect(r.status).toBe(200);
    expect(r.body.maintenance).toMatchObject({
      active: true,
      title: 'Launch day',
      description: 'Opening at noon.',
      endsAt,
      autoEnd: false,
      updatedBy: 'owner',
    });
    expect(await status()).toEqual({
      active: true,
      title: 'Launch day',
      description: 'Opening at noon.',
      endsAt,
      autoEnd: false,
    });
    expect((await new MaintenanceSwitch(h.db).load()).state.active).toBe(true);
    const audit = await listAudit(h.db, { limit: 5 });
    expect(audit.map((a) => a.action)).toContain('maintenance.on');
    // Without autoEnd, a countdown that runs out leaves the page up.
    clock = endsAt + 1;
    expect((await status()).active).toBe(true);
  });

  it('opens again by itself when an autoEnd countdown runs out', async () => {
    expect(
      (
        await call('owner', 'POST', '/maintenance', {
          endsAt: clock + 60_000,
          autoEnd: true,
        })
      ).status,
    ).toBe(200);
    expect((await status()).active).toBe(true);
    clock += 60_001;
    expect((await status()).active).toBe(false);
  });

  it('refuses to switch on with an autoEnd countdown already in the past, and drops autoEnd without a countdown', async () => {
    await call('owner', 'POST', '/maintenance', { active: false });
    expect(
      (
        await call('owner', 'POST', '/maintenance', {
          active: true,
          endsAt: clock - 1000,
          autoEnd: true,
        })
      ).status,
    ).toBe(400);
    const r = await call('owner', 'POST', '/maintenance', {
      active: true,
      endsAt: null,
      autoEnd: true,
    });
    expect(r.body.maintenance).toMatchObject({
      active: true,
      endsAt: null,
      autoEnd: false,
    });
    expect((await call('owner', 'POST', '/maintenance', { active: false })).body.maintenance.active).toBe(false);
    expect((await status()).active).toBe(false);
    const audit = await listAudit(h.db, { limit: 1 });
    expect(audit[0]?.action).toBe('maintenance.off');
  });
});
