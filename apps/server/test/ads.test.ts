import { openDb, listAudit, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/admin';
import { AdService } from '../src/ads/service';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { ChessServer } from '../src/server';
import { TournamentService } from '../src/tournaments/service';

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';
/** A 1x1 transparent PNG, as the console's picker would send it. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let h: DbHandle;
let auth: AuthService;
let admin: AdminService;
let ads: AdService;
let server: ChessServer;
let base: string;
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

/** The public feed the app reads. */
async function publicAds() {
  const res = await fetch(`${base}/api/ads`);
  return (await res.json()) as { ads: { id: string; spot: string; sponsor: string; title: string; image: string | null }[] };
}

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'alice']) await signup(u);
  admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner']);
  ads = new AdService({ db: h.db });
  await ads.load();
  admin.ads = ads;
  const tournaments = new TournamentService({ db: h.db });
  await tournaments.load();
  admin.tournaments = tournaments;
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    ads,
    tournaments,
    http: [authRoutes(auth, { rateLimit: false })],
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('ad spots', () => {
  it('shows nothing at all until a spot is switched on', async () => {
    expect((await publicAds()).ads).toEqual([]);
    const console_ = await call('owner', 'GET', '/ads');
    expect(console_.status).toBe(200);
    // Every spot is listed, all off, so staff can see what is for sale.
    expect(console_.body.spots.length).toBeGreaterThan(0);
    expect(console_.body.spots.every((s: { enabled: boolean }) => !s.enabled)).toBe(true);
    expect(console_.body.placements).toEqual([]);
  });

  it('keeps a placement hidden while its spot is off', async () => {
    const r = await call('owner', 'POST', '/ads', { spot: 'home.feed', sponsor: 'Acme', title: 'Sponsor of the week', period: 'week' });
    expect(r.status).toBe(200);
    expect((await publicAds()).ads).toEqual([]);
    // Switching the spot on makes the same placement appear.
    expect((await call('owner', 'POST', '/ads-spots/home.feed', { enabled: true })).status).toBe(200);
    const live = await publicAds();
    expect(live.ads).toHaveLength(1);
    expect(live.ads[0]).toMatchObject({ spot: 'home.feed', sponsor: 'Acme', title: 'Sponsor of the week' });
  });

  it('hides it again when the spot is switched off', async () => {
    await call('owner', 'POST', '/ads-spots/home.feed', { enabled: false });
    expect((await publicAds()).ads).toEqual([]);
    await call('owner', 'POST', '/ads-spots/home.feed', { enabled: true });
  });

  it('serves an uploaded image from its own endpoint, and never inside the feed', async () => {
    const r = await call('owner', 'POST', '/ads', { spot: 'play.lobby', sponsor: 'Imagey', title: 'With a logo', period: 'month', image: PNG });
    expect(r.status).toBe(200);
    await call('owner', 'POST', '/ads-spots/play.lobby', { enabled: true });
    const ad = (await publicAds()).ads.find((a) => a.spot === 'play.lobby')!;
    expect(ad.image).toBe(`/api/ads/${ad.id}/image`);
    const img = await fetch(`${base}${ad.image}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('does not show a placement whose period has not started or has passed', async () => {
    const future = Date.now() + 86_400_000;
    const r = await call('owner', 'POST', '/ads', { spot: 'learn.list', sponsor: 'Later', title: 'Next week', startsAt: future, period: 'week' });
    expect(r.body.placement.startsAt).toBe(future);
    await call('owner', 'POST', '/ads-spots/learn.list', { enabled: true });
    expect((await publicAds()).ads.some((a) => a.spot === 'learn.list')).toBe(false);
  });

  it('takes a placement down by hand and puts it back', async () => {
    const id = (await call('owner', 'GET', '/ads')).body.placements.find((p: { spot: string }) => p.spot === 'home.feed').id;
    await call('owner', 'POST', `/ads/${id}/stop`, { stopped: true });
    expect((await publicAds()).ads.some((a) => a.spot === 'home.feed')).toBe(false);
    await call('owner', 'POST', `/ads/${id}/stop`, { stopped: false });
    expect((await publicAds()).ads.some((a) => a.spot === 'home.feed')).toBe(true);
  });

  it('counts views and taps, and shrugs off an id it does not know', async () => {
    const ad = (await publicAds()).ads.find((a) => a.spot === 'home.feed')!;
    await fetch(`${base}/api/ads/${ad.id}/view`, { method: 'POST' });
    await fetch(`${base}/api/ads/${ad.id}/click`, { method: 'POST' });
    const p = (await call('owner', 'GET', '/ads')).body.placements.find((x: { id: string }) => x.id === ad.id);
    expect(p.impressions).toBe(1);
    expect(p.clicks).toBe(1);
    // An old creative left on someone's screen must not produce an error.
    const gone = await fetch(`${base}/api/ads/nope/view`, { method: 'POST' });
    expect(gone.status).toBe(200);
  });

  it('refuses a bad placement with the field that is wrong', async () => {
    const r = await call('owner', 'POST', '/ads', { spot: 'home.feed', sponsor: 'Acme', title: 'Hi', url: 'not a link', period: 'week' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('valid link');
  });

  it('writes every change to the audit log', async () => {
    const entries = await listAudit(h.db, {});
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('ads.spot.on');
    expect(actions).toContain('ads.place');
    expect(actions).toContain('ads.stop');
  });

  it('deletes a placement for good', async () => {
    const id = (await call('owner', 'GET', '/ads')).body.placements.find((p: { spot: string }) => p.spot === 'learn.list').id;
    expect((await call('owner', 'POST', `/ads/${id}/delete`)).status).toBe(200);
    expect((await call('owner', 'GET', '/ads')).body.placements.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it('keeps players and moderators out of the console', async () => {
    expect((await call('alice', 'GET', '/ads')).status).toBe(403);
    await call('owner', 'POST', `/players/${ids.mod}/role`, { role: 'moderator' });
    // Moderators run community safety; selling spots is an admin job.
    expect((await call('mod', 'GET', '/ads')).status).toBe(403);
    expect((await call('mod', 'POST', '/ads-spots/home.feed', { enabled: false })).status).toBe(403);
  });
});

describe('sponsor applications feed the spots', () => {
  it('takes a spot preference from the public form and asks for material', async () => {
    const res = await fetch(`${base}/api/sponsors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Dana Reed', email: 'dana@acme.example', company: 'Acme', spot: 'game.over', message: 'We would like the game over card.' }),
    });
    expect(res.status).toBe(200);
    const list = await call('owner', 'GET', '/sponsors');
    const a = list.body.applications[0];
    expect(a).toMatchObject({ company: 'Acme', spot: 'game.over', status: 'new', materialRequestedAt: null });

    const asked = await call('owner', 'POST', `/sponsors/${a.id}/material`);
    expect(asked.status).toBe(200);
    expect(asked.body.application.status).toBe('material');
    expect(asked.body.application.materialRequestedAt).toBeGreaterThan(0);
    expect((await listAudit(h.db, {})).some((e) => e.action === 'sponsor.material')).toBe(true);
  });

  it('places that application on a spot and remembers where it came from', async () => {
    const a = (await call('owner', 'GET', '/sponsors')).body.applications[0];
    const r = await call('owner', 'POST', '/ads', { spot: 'game.over', sponsor: 'Acme', title: 'Sponsor of the month', period: 'month', applicationId: a.id, url: 'acme.example' });
    expect(r.status).toBe(200);
    expect(r.body.placement.applicationId).toBe(a.id);
    expect(r.body.placement.url).toBe('https://acme.example/');
    await call('owner', 'POST', '/ads-spots/game.over', { enabled: true });
    expect((await publicAds()).ads.some((x) => x.spot === 'game.over')).toBe(true);
  });
});
