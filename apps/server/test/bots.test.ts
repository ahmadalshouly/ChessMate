import { openDb, listAudit, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore, authRoutes } from '../src/auth';
import { BotService } from '../src/bots/service';
import { ChessServer } from '../src/server';

const SECRET = 'test-secret-test-secret-test-secret!';
const PASSWORD = 'correct horse battery';
/** A 1x1 transparent PNG, as the console's picker would send it. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let h: DbHandle;
let auth: AuthService;
let admin: AdminService;
let bots: BotService;
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

type PublicBot = { id: string; name: string; rating: number; style: string; tag: string | null; url: string | null; avatar: string | null; featured: boolean };

/** The public list the app reads. */
async function publicBots(): Promise<PublicBot[]> {
  const res = await fetch(`${base}/api/bots`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { bots: PublicBot[] }).bots;
}

const streamer = { name: 'Captain Rook', tagline: 'Catch me live every Friday.', rating: 2400, style: 'aggressive', tag: 'streamer', url: 'twitch.tv/captainrook', featured: true };

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  auth = new AuthService({ store: new DbAuthStore(h.db), mailer: new ConsoleMailer(), secret: SECRET });
  for (const u of ['owner', 'mod', 'alice']) await signup(u);
  admin = new AdminService({ db: h.db, auth, log: () => {} });
  await admin.load(['owner']);
  bots = new BotService({ db: h.db });
  await bots.load();
  admin.bots = bots;
  server = new ChessServer({
    port: 0,
    matchIntervalMs: 20,
    auth,
    admin,
    bots,
    http: [authRoutes(auth, { rateLimit: false })],
    fairPlay: { analyzer: null, log: () => {} },
  });
  base = `http://localhost:${await server.listen()}`;
}, 60_000);

afterAll(async () => {
  await server.close();
  await h.close();
});

describe('online bots', () => {
  it('lists nothing until staff add a bot', async () => {
    expect(await publicBots()).toEqual([]);
    const c = await call('owner', 'GET', '/bots');
    expect(c.status).toBe(200);
    expect(c.body.bots).toEqual([]);
  });

  it('creates a streamer bot that players see straight away', async () => {
    const r = await call('owner', 'POST', '/bots', streamer);
    expect(r.status).toBe(200);
    expect(r.body.bot).toMatchObject({ name: 'Captain Rook', rating: 2400, style: 'aggressive', tag: 'streamer', url: 'https://twitch.tv/captainrook', featured: true, enabled: true, games: 0, createdBy: 'owner' });
    const list = await publicBots();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Captain Rook', tagline: 'Catch me live every Friday.', rating: 2400, featured: true, avatar: null });
    // The public list carries nothing from the console side.
    expect(list[0]).not.toHaveProperty('createdBy');
    expect(list[0]).not.toHaveProperty('games');
  });

  it('serves an uploaded picture from its own endpoint, and a linked one as it is', async () => {
    const up = await call('owner', 'POST', '/bots', { name: 'Pixel Pawn', rating: 900, style: 'balanced', image: PNG });
    expect(up.status).toBe(200);
    const linked = await call('owner', 'POST', '/bots', { name: 'Linky', rating: 1500, style: 'solid', imageUrl: 'https://example.com/me.png' });
    const list = await publicBots();
    const pixel = list.find((b) => b.name === 'Pixel Pawn')!;
    expect(pixel.avatar).toMatch(new RegExp(`^/api/bots/${up.body.bot.id}/avatar\\?v=\\d+$`));
    const img = await fetch(`${base}${pixel.avatar}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(list.find((b) => b.id === linked.body.bot.id)!.avatar).toBe('https://example.com/me.png');
  });

  it('keeps the stored picture when the form is saved without one, and clears it on request', async () => {
    const pixel = (await call('owner', 'GET', '/bots')).body.bots.find((b: { name: string }) => b.name === 'Pixel Pawn');
    const saved = await call('owner', 'POST', `/bots/${pixel.id}`, { name: 'Pixel Pawn', rating: 950, style: 'gambit' });
    expect(saved.body.bot.rating).toBe(950);
    expect(saved.body.bot.imagePath).not.toBeNull();
    const cleared = await call('owner', 'POST', `/bots/${pixel.id}`, { name: 'Pixel Pawn', rating: 950, style: 'gambit', image: null });
    expect(cleared.body.bot.imagePath).toBeNull();
  });

  it('puts featured bots first, then the rest weakest first', async () => {
    const list = await publicBots();
    expect(list[0]!.name).toBe('Captain Rook');
    const rest = list.slice(1).map((b) => b.rating);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
  });

  it('hides a switched-off bot from players and brings it back', async () => {
    const id = (await publicBots()).find((b) => b.name === 'Linky')!.id;
    expect((await call('owner', 'POST', `/bots/${id}/flags`, { enabled: false })).body.bot.enabled).toBe(false);
    expect((await publicBots()).some((b) => b.id === id)).toBe(false);
    // Still in the console, so nothing is lost.
    expect((await call('owner', 'GET', '/bots')).body.bots.some((b: { id: string }) => b.id === id)).toBe(true);
    await call('owner', 'POST', `/bots/${id}/flags`, { enabled: true });
    expect((await publicBots()).some((b) => b.id === id)).toBe(true);
  });

  it('counts finished games, and shrugs off what it does not know', async () => {
    const id = (await publicBots()).find((b) => b.name === 'Captain Rook')!.id;
    for (const result of ['win', 'loss', 'loss', 'draw']) {
      const r = await fetch(`${base}/api/bots/${id}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ result }) });
      expect(r.status).toBe(200);
    }
    expect((await fetch(`${base}/api/bots/nope/result`, { method: 'POST', body: '{"result":"win"}' })).status).toBe(200);
    expect((await fetch(`${base}/api/bots/${id}/result`, { method: 'POST', body: '{"result":"forfeit"}' })).status).toBe(200);
    const view = (await call('owner', 'GET', '/bots')).body.bots.find((b: { id: string }) => b.id === id);
    expect(view).toMatchObject({ games: 4, playerWins: 1, botWins: 2, draws: 1 });
    // Written through, not only in memory.
    expect(await bots.reload(id)).toMatchObject({ games: 4, playerWins: 1, botWins: 2, draws: 1 });
  });

  it('refuses a bad bot with the field that is wrong', async () => {
    const tooStrong = await call('owner', 'POST', '/bots', { ...streamer, rating: 5000 });
    expect(tooStrong.status).toBe(400);
    expect(tooStrong.body.error.message).toContain('between 250 and 3500');
    const badLink = await call('owner', 'POST', '/bots', { ...streamer, url: 'not a link' });
    expect(badLink.status).toBe(400);
    expect(badLink.body.error.message).toContain('valid link');
  });

  it('writes every change to the audit log', async () => {
    const actions = (await listAudit(h.db, {})).map((e) => e.action);
    expect(actions).toContain('bots.create');
    expect(actions).toContain('bots.edit');
    expect(actions).toContain('bots.off');
    expect(actions).toContain('bots.on');
  });

  it('deletes a bot for good', async () => {
    const id = (await publicBots()).find((b) => b.name === 'Linky')!.id;
    expect((await call('owner', 'POST', `/bots/${id}/delete`)).status).toBe(200);
    expect((await publicBots()).some((b) => b.id === id)).toBe(false);
    expect((await call('owner', 'GET', '/bots')).body.bots.some((b: { id: string }) => b.id === id)).toBe(false);
    expect((await listAudit(h.db, {})).some((e) => e.action === 'bots.delete')).toBe(true);
  });

  it('keeps players and moderators out of the console', async () => {
    expect((await call('alice', 'GET', '/bots')).status).toBe(403);
    await call('owner', 'POST', `/players/${ids.mod}/role`, { role: 'moderator' });
    expect((await call('mod', 'GET', '/bots')).status).toBe(403);
    expect((await call('mod', 'POST', '/bots', streamer)).status).toBe(403);
  });

  it('lets a signed-in web app ask from another origin', async () => {
    // The app sends its sign-in token whenever it has one; without this the browser drops the list.
    const res = await fetch(`${base}/api/bots`, { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('loads every bot back after a restart', async () => {
    const fresh = new BotService({ db: h.db });
    await fresh.load();
    expect(fresh.list().map((b) => b.name)).toEqual((await publicBots()).map((b) => b.name));
  });
});
