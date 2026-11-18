import { decodeServer, encode, type ClientMessage } from '@chessmate/core';
import { getUser, listAudit, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { LogEmailSender } from '../src/email';
import { ChessServer } from '../src/server';

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';

let h: DbHandle;
let auth: AuthService;
let admin: AdminService;
let server: ChessServer;
let base: string;
const email = new LogEmailSender(() => {});
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

async function signup(username: string) {
  const r = await auth.signup({ username, email: `${username}@example.com`, password: PASSWORD });
  tokens[username] = r.tokens.accessToken;
  ids[username] = r.user.id;
}

async function call(as: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens[as]}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'alice', 'bob']) await signup(u);
  admin = new AdminService({ db: h.db, auth, email, log: () => {} });
  await admin.load(['owner', 'nobody_yet']);
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    http: [authRoutes(auth, { rateLimit: false })],
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('admin console', () => {
  it('only lets staff in, and ADMIN_USERNAMES makes the owner an admin', async () => {
    expect((await call('alice', 'GET', '/me')).status).toBe(403);
    const me = await call('owner', 'GET', '/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('admin');
    expect(me.body.permissions).toContain('accounts.close');
    const audit = await listAudit(h.db, { targetId: ids.owner });
    expect(audit[0]?.action).toBe('role.change');
    // The role reaches the app through /api/auth/me.
    const res = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${tokens.owner}` } });
    expect(((await res.json()) as { user: { role: string } }).user.role).toBe('admin');
  });

  it('makes an ADMIN_USERNAMES account admin as soon as it signs up', async () => {
    await signup('nobody_yet');
    expect(admin.roleOf(ids.nobody_yet!)).toBe('admin');
    expect((await call('nobody_yet', 'GET', '/me')).body.role).toBe('admin');
    await call('owner', 'POST', `/players/${ids.nobody_yet}/role`, { role: 'user' });
  });

  it('gives moderators their own, smaller set of tools', async () => {
    expect((await call('owner', 'POST', `/players/${ids.mod}/role`, { role: 'moderator', reason: 'new mod' })).status).toBe(200);
    expect((await call('owner', 'POST', `/players/${ids.owner}/role`, { role: 'user' })).status).toBe(403);
    const me = await call('mod', 'GET', '/me');
    expect(me.body.role).toBe('moderator');
    // Moderators can warn and mute, but not close accounts, move ratings or see emails.
    expect((await call('mod', 'POST', `/players/${ids.alice}/warn`, { category: 'abusive_chat', message: 'Keep chat friendly' })).status).toBe(200);
    expect((await call('mod', 'POST', `/players/${ids.alice}/mute`, { hours: 24, reason: 'insults' })).status).toBe(200);
    expect((await call('mod', 'POST', `/players/${ids.alice}/close`, { reason: 'abuse' })).status).toBe(403);
    expect((await call('mod', 'POST', `/players/${ids.alice}/rating`, { category: 'blitz', delta: 50, reason: 'x' })).status).toBe(403);
    const seen = await call('mod', 'GET', `/players/${ids.alice}`);
    expect(seen.body.player.email).toBeNull();
    expect(seen.body.player.warnings).toHaveLength(1);
    expect(seen.body.player.chatMute.reason).toBe('insults');
    const asAdmin = await call('owner', 'GET', `/players/${ids.alice}`);
    expect(asAdmin.body.player.email).toBe('alice@example.com');
  });

  it('searches players by name and status', async () => {
    const r = await call('owner', 'GET', '/players?q=ali');
    expect(r.body.players.map((p: { username: string }) => p.username)).toEqual(['alice']);
    const staff = await call('owner', 'GET', '/players?role=staff');
    expect(staff.body.players.map((p: { username: string }) => p.username).sort()).toEqual(['mod', 'owner']);
    const muted = await call('owner', 'GET', '/players?status=muted');
    expect(muted.body.players.map((p: { username: string }) => p.username)).toEqual(['alice']);
  });

  it('adjusts ratings with a reason and keeps them in the database', async () => {
    const r = await call('owner', 'POST', `/players/${ids.bob}/rating`, { category: 'rapid', delta: -120, reason: 'sandbagging' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ before: 1500, after: 1380 });
    expect(server.ratings.get(ids.bob!, 'rapid', Date.now()).rating).toBe(1380);
    expect((await call('owner', 'POST', `/players/${ids.bob}/rating`, { category: 'rapid', delta: 5000, reason: 'x' })).status).toBe(400);
    expect((await call('owner', 'POST', `/players/${ids.bob}/rating`, { category: 'rapid', delta: 10 })).status).toBe(400);
  });

  it('closes an account: no sign-in, no play, live socket kicked; reopening restores it', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    const closed = new Promise<number>((r) => ws.on('close', (c) => r(c)));
    const welcomed = new Promise<void>((r) => ws.on('message', (d) => decodeServer(String(d))?.t === 'welcome' && r()));
    await new Promise((r) => ws.on('open', r));
    ws.send(encode({ t: 'hello', v: 1, token: tokens.alice } as ClientMessage));
    await welcomed;

    const c = await call('owner', 'POST', `/players/${ids.alice}/close`, { reason: 'abuse', note: 'repeated slurs' });
    expect(c.status).toBe(200);
    expect(await closed).toBe(4011);
    expect((await getUser(h.db, ids.alice!))?.closedReason).toBe('abuse');

    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'alice', password: PASSWORD }) });
    expect(login.status).toBe(403);
    expect(((await login.json()) as { error: { code: string } }).error.code).toBe('account_closed');
    expect(auth.verifyAccessToken(tokens.alice!)).toBeNull();
    expect((await call('owner', 'POST', `/players/${ids.alice}/close`, { reason: 'abuse' })).status).toBe(409);
    // Closed players drop out of the leaderboard and friend search, but staff still find them.
    const found = await call('owner', 'GET', '/players?status=closed');
    expect(found.body.players.map((p: { username: string }) => p.username)).toEqual(['alice']);

    expect((await call('owner', 'POST', `/players/${ids.alice}/reopen`, { note: 'appeal accepted' })).status).toBe(200);
    const again = await auth.login({ login: 'alice', password: PASSWORD });
    expect(again.user.username).toBe('alice');
    tokens.alice = again.tokens.accessToken;

    const log = await call('owner', 'GET', `/audit?target=${ids.alice}`);
    expect(log.body.entries.map((e: { action: string }) => e.action)).toEqual(['account.reopen', 'account.close', 'chat.mute', 'player.warn']);
  });

  it('closes for fair play through the fair-play queue and refunds the opponents', async () => {
    server.fairPlay.gameFinished({
      gameId: 'g-fp-1',
      initialFen: 'startpos',
      moves: [],
      thinkMs: [],
      white: { id: ids.bob!, rating: 1500 },
      black: { id: ids.alice!, rating: 1500 },
      endedAt: Date.now(),
      rated: true,
      timeControl: { initialMs: 300_000, incrementMs: 0 },
      ratingDelta: { w: 8, b: -8 },
    });
    const before = server.ratings.get(ids.alice!, 'blitz', Date.now()).rating;
    expect((await call('mod', 'POST', `/fairplay/${ids.bob}/open`, { note: 'reported by several players' })).status).toBe(200);
    expect((await call('mod', 'POST', `/fairplay/${ids.bob}/ban`, {})).status).toBe(403);
    const queue = await call('mod', 'GET', '/fairplay');
    expect(queue.body.cases[0]).toMatchObject({ username: 'bob', status: 'open' });
    const r = await call('owner', 'POST', `/fairplay/${ids.bob}/ban`, { note: 'engine use confirmed' });
    expect(r.status).toBe(200);
    expect(r.body.refunds).toEqual([{ gameId: 'g-fp-1', playerId: ids.alice, category: 'blitz', points: 8 }]);
    expect(server.ratings.get(ids.alice!, 'blitz', Date.now()).rating).toBeCloseTo(before + 8);
    expect(admin.isClosed(ids.bob!)).toBe(true);
    const file = await call('owner', 'GET', `/fairplay/${ids.bob}`);
    expect(file.body.case.status).toBe('banned');
    expect(file.body.player.fairPlay).toBe('banned');
  });

  it('tells players about warnings and closures in the app and by email; fair-play closures can still sign in', async () => {
    // bob was closed for fair play above.
    const closedMail = email.sent.find((m) => m.to === 'bob@example.com');
    expect(closedMail?.subject).toMatch(/fair play/i);
    expect(closedMail?.text).toMatch(/online play is now turned off/i);
    const inApp = server.notifications.store.list(ids.bob!);
    expect(inApp[0]).toMatchObject({ kind: 'system', title: 'Account restricted for fair play' });
    expect(inApp[0]!.data).toMatchObject({ category: 'fair_play', action: 'closed' });

    // Sign-in still works, with the restriction on the account.
    const login = await auth.login({ login: 'bob', password: PASSWORD });
    expect(login.user.restriction).toEqual({ reason: 'fair_play', since: expect.any(String) });
    expect(auth.verifyAccessToken(login.tokens.accessToken)?.userId).toBe(ids.bob);
    const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${login.tokens.accessToken}` } });
    expect(((await me.json()) as { user: { restriction: unknown } }).user.restriction).toMatchObject({ reason: 'fair_play' });

    // Connected, but online play is refused.
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    const inbox: { t: string; [k: string]: unknown }[] = [];
    ws.on('message', (d) => inbox.push(decodeServer(String(d)) as never));
    await new Promise((r) => ws.on('open', r));
    ws.send(encode({ t: 'hello', v: 1, token: login.tokens.accessToken } as ClientMessage));
    const next = async (t: string) => {
      for (let i = 0; i < 200; i++) {
        const idx = inbox.findIndex((m) => m.t === t);
        if (idx >= 0) return inbox.splice(idx, 1)[0]!;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`timed out waiting for ${t}`);
    };
    expect((await next('welcome')).restriction).toEqual({ reason: 'fair_play' });
    ws.send(encode({ t: 'seek', timeControl: { initialMs: 180_000, incrementMs: 0 }, rated: true } as ClientMessage));
    expect((await next('error')).code).toBe('account_restricted');

    // A fair-play warning reaches the player by email too.
    expect((await call('owner', 'POST', `/players/${ids.alice}/warn`, { category: 'cheating', message: 'Do not use an engine' })).status).toBe(200);
    const warnMail = [...email.sent].reverse().find((m) => m.to === 'alice@example.com');
    expect(warnMail?.subject).toMatch(/fair play warning/i);
    expect(warnMail?.text).toContain('Do not use an engine');
    expect(server.notifications.store.list(ids.alice!)[0]).toMatchObject({ title: 'Fair play warning', body: 'Do not use an engine' });

    // With a Messages inbox wired, staff notices go there instead of a bare notification.
    const inbox2: { userId: string; title: string; category: string }[] = [];
    admin.systemMessages = { send: (userId, m) => void inbox2.push({ userId, title: m.title, category: m.category }) };
    expect((await call('owner', 'POST', `/players/${ids.bob}/reopen`, { note: 'appeal upheld' })).status).toBe(200);
    admin.systemMessages = null;
    expect(inbox2).toEqual([{ userId: ids.bob, title: 'Fair play restriction lifted', category: 'fair_play' }]);
    expect((await next('restriction')).restriction).toBeNull();
    expect([...email.sent].reverse().find((m) => m.to === 'bob@example.com')?.subject).toMatch(/can play again/i);
    expect((await auth.login({ login: 'bob', password: PASSWORD })).user.restriction).toBeNull();
    ws.close();
  });

  it('shows dashboard numbers', async () => {
    const d = await call('mod', 'GET', '/dashboard');
    expect(d.status).toBe(200);
    expect(d.body.accounts.total).toBe(5);
    expect(d.body.accounts.closed).toBe(0);
    expect(d.body.accounts.staff).toBe(2);
    expect(d.body.daily).toHaveLength(14);
    expect(d.body.recent.length).toBeGreaterThan(0);
  });
});

// 1x1 PNG and a minimal PDF header: the server checks magic bytes, not just the declared type.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');

async function titleCall(as: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/titles${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens[as]}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('title applications', () => {
  let appId = '';

  it('lets a player apply with proof, once at a time, and checks the files', async () => {
    await signup('carla');
    const bad = await titleCall('carla', 'POST', '/apply', { title: 'IM', fullName: 'Carla Ruiz', documents: [{ name: 'cert.png', mime: 'image/png', data: PDF }] });
    expect(bad.status).toBe(400);
    expect((await titleCall('carla', 'POST', '/apply', { title: 'IM', fullName: 'Carla Ruiz', documents: [] })).body.error.field).toBe('documents');
    const ok = await titleCall('carla', 'POST', '/apply', {
      title: 'IM',
      fullName: 'Carla Ruiz',
      fideId: '2201234',
      federation: 'es',
      note: 'Title awarded 2019',
      documents: [
        { name: 'certificate.pdf', mime: 'application/pdf', data: PDF },
        { name: 'card.png', mime: 'image/png', data: PNG },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.application).toMatchObject({ title: 'IM', federation: 'ES', status: 'pending' });
    expect(ok.body.application.documents).toHaveLength(2);
    appId = ok.body.application.id;
    const twice = await titleCall('carla', 'POST', '/apply', { title: 'GM', fullName: 'Carla Ruiz', documents: [{ name: 'c.png', mime: 'image/png', data: PNG }] });
    expect(twice.status).toBe(409);
    const mine = await titleCall('carla', 'GET', '/me');
    expect(mine.body).toMatchObject({ title: null });
    expect(mine.body.applications[0].reviewedBy).toBeNull();
  });

  it('shows staff the queue and opens proof documents through a signed link', async () => {
    const queue = await call('mod', 'GET', '/titles');
    expect(queue.body.applications.map((a: { username: string }) => a.username)).toEqual(['carla']);
    expect((await call('mod', 'GET', '/dashboard')).body.queues.titleApplications).toBe(1);
    const app = (await call('mod', 'GET', `/titles/${appId}`)).body.application;
    const link = await call('mod', 'GET', `/documents/${app.documents[1].id}`);
    expect(link.status).toBe(200);
    const file = await fetch(link.body.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer()).toString('base64')).toBe(PNG);
    // Tampered or token-less links are refused, and players cannot reach the queue.
    expect((await fetch(link.body.url.replace(/sig=[^&]+/, 'sig=nope'))).status).toBe(403);
    expect((await call('carla', 'GET', '/titles')).status).toBe(403);
  });

  it('approves a title: it shows on the profile and in the admin record', async () => {
    expect((await call('mod', 'POST', `/titles/${appId}/reject`, {})).status).toBe(400);
    expect((await call('mod', 'POST', `/titles/${appId}/approve`, { note: 'FIDE profile matches' })).status).toBe(200);
    expect((await call('mod', 'POST', `/titles/${appId}/approve`, {})).status).toBe(409);
    expect(admin.titles.titleOf(ids.carla!)).toBe('IM');
    expect((await titleCall('carla', 'GET', '/me')).body.title).toBe('IM');
    const p = await call('owner', 'GET', `/players/${ids.carla}`);
    expect(p.body.player.title).toBe('IM');
    expect(p.body.player.titleApplications[0]).toMatchObject({ status: 'approved', reviewedBy: 'mod' });
    expect((await getUser(h.db, ids.carla!))?.title).toBe('IM');
  });

  it('lets admins take a title away, and a fair-play closure removes it automatically', async () => {
    // Moderators review applications but cannot remove titles.
    expect((await call('mod', 'POST', `/players/${ids.carla}/title`, { title: null, reason: 'invalid_proof' })).status).toBe(403);
    expect((await call('owner', 'POST', `/players/${ids.carla}/title`, { title: null })).status).toBe(400);
    expect((await call('owner', 'POST', `/players/${ids.carla}/title`, { title: null, reason: 'invalid_proof', note: 'Certificate was edited' })).status).toBe(200);
    expect(admin.titles.titleOf(ids.carla!)).toBeNull();
    expect((await call('owner', 'POST', `/players/${ids.carla}/title`, { title: 'FM', note: 'Checked on ratings.fide.com' })).status).toBe(200);
    expect(admin.titles.titleOf(ids.carla!)).toBe('FM');

    expect((await call('owner', 'POST', `/players/${ids.carla}/close`, { reason: 'fair_play', note: 'engine' })).status).toBe(200);
    expect(admin.titles.titleOf(ids.carla!)).toBeNull();
    const log = await call('owner', 'GET', `/audit?target=${ids.carla}&action=title`);
    expect(log.body.entries.map((e: { action: string }) => e.action)).toEqual(['title.revoke', 'title.grant', 'title.revoke', 'title.approve']);
  });
});

describe('fair-play persistence', () => {
  it('keeps cases, bans, refund history and the case log across a restart', async () => {
    const { DbFairPlayStore } = await import('../src/fairplay');
    const a = await DbFairPlayStore.load(h.db);
    a.saveCase({ playerId: 'p1', status: 'open', score: 72, reasons: ['manual_report'], assessment: null, openedAt: 1, updatedAt: 2 });
    a.saveBan({ playerId: 'p2', reason: 'engine', bannedAt: 3, by: 'owner', refunds: [] });
    a.addRatedGame({ gameId: 'g9', category: 'blitz', endedAt: 4, white: { id: 'p1', delta: 8 }, black: { id: 'p3', delta: -8 } });
    a.markRefunded('g9');
    a.audit({ at: 5, playerId: 'p1', action: 'manual_report', by: 'owner', note: 'x' });
    a.deleteBan('p2');
    await a.flush();
    const b = await DbFairPlayStore.load(h.db);
    expect(b.getCase('p1')).toMatchObject({ status: 'open', score: 72 });
    expect(b.getBan('p2')).toBeUndefined();
    expect(b.ratedGamesOf('p3', 0)[0]).toMatchObject({ gameId: 'g9', refunded: true });
    expect(b.auditFor('p1')).toHaveLength(1);
  });
});
