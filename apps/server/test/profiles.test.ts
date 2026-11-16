import { DEFAULT_SETTINGS, type MyProfile, type PublicProfile } from '@chessmate/core';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevProfileBackend, MemoryProfileStore, SqliteProfileStore, profileRoutes } from '../src/profiles';
import { ChessServer } from '../src/server';

let server: ChessServer;
let base: string;
const backend = new DevProfileBackend();

beforeAll(async () => {
  server = new ChessServer({ port: 0, http: [profileRoutes(backend, new MemoryProfileStore())] });
  base = `http://localhost:${await server.listen()}`;
});
afterAll(() => server.close());

const call = async <T = unknown>(method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};

describe('profile API', () => {
  it('serves a public profile with ratings, W/D/L and recent games', async () => {
    const { status, data } = await call<PublicProfile>('GET', '/api/profiles/demo');
    expect(status).toBe(200);
    expect(data.username).toBe('demo');
    expect(data.ratings.map((r) => r.category)).toEqual(['bullet', 'blitz', 'rapid', 'classical']);
    const blitz = data.ratings.find((r) => r.category === 'blitz')!;
    expect(blitz.games).toBe(70);
    expect(blitz.wins + blitz.draws + blitz.losses).toBe(70);
    expect(data.totals.games).toBe(120);
    expect(data.recentGames).toHaveLength(10);
    expect(data.isMe).toBe(false);
  });

  it('derives a rating history that ends at the current rating', async () => {
    const prof = (await call<PublicProfile>('GET', '/api/profiles/demo')).data;
    const { data } = await call<{ points: { t: number; rating: number }[] }>('GET', '/api/profiles/demo/rating-history?category=blitz');
    expect(data.points).toHaveLength(70);
    expect(data.points[0]!.t).toBeLessThan(data.points[69]!.t);
    const current = prof.ratings.find((r) => r.category === 'blitz')!.rating;
    expect(Math.abs(data.points[69]!.rating - current)).toBeLessThanOrEqual(1);
  });

  it('404s unknown players and requires sign-in for /api/me', async () => {
    expect((await call('GET', '/api/profiles/nobody_here')).status).toBe(404);
    expect((await call('GET', '/api/me/profile')).status).toBe(401);
    expect((await call('GET', '/api/me/profile', { token: 'nonsense' })).status).toBe(401);
  });

  it('edits the profile with validation', async () => {
    const token = 'dev:u1:alice';
    const ok = await call<MyProfile>('PATCH', '/api/me/profile', {
      token,
      body: { displayName: '  Alice   L ', bio: 'Endgames.', country: 'se', avatar: { id: 'knight', tone: 'graphite' } },
    });
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ displayName: 'Alice L', bio: 'Endgames.', country: 'SE', avatar: { id: 'knight', tone: 'graphite' }, isMe: true });
    expect(ok.data.email).toBe('u1@example.test');

    const bad = await call<{ field: string }>('PATCH', '/api/me/profile', { token, body: { country: 'XX' } });
    expect(bad.status).toBe(400);
    expect(bad.data.field).toBe('country');
    expect((await call('PATCH', '/api/me/profile', { token, body: { bio: 'x'.repeat(401) } })).status).toBe(400);
    expect((await call('PATCH', '/api/me/profile', { token, body: { avatar: { id: 'dragon', tone: 'ink' } } })).status).toBe(400);
  });

  it('patches settings and rejects unknown or mistyped keys', async () => {
    const token = 'dev:u2:bob';
    expect((await call('GET', '/api/me/settings', { token })).data).toEqual(DEFAULT_SETTINGS);
    const r = await call<typeof DEFAULT_SETTINGS>('PATCH', '/api/me/settings', { token, body: { board: { theme: 'slate' }, sound: { volume: 0.2 } } });
    expect(r.status).toBe(200);
    expect(r.data.board.theme).toBe('slate');
    expect(r.data.board.pieces).toBe('classic');
    expect(r.data.sound.volume).toBe(0.2);
    expect((await call('PATCH', '/api/me/settings', { token, body: { board: { theme: 'neon' } } })).status).toBe(400);
    expect((await call('PATCH', '/api/me/settings', { token, body: { sound: { enabled: 'yes' } } })).status).toBe(400);
    expect((await call('PATCH', '/api/me/settings', { token, body: { hacks: {} } })).status).toBe(400);
    expect((await call<typeof DEFAULT_SETTINGS>('GET', '/api/me/settings', { token })).data.board.theme).toBe('slate');
  });

  it('hides games and rating history from others when private', async () => {
    const token = 'dev:u3:carol';
    await call('PATCH', '/api/me/settings', { token, body: { privacy: { showGames: false, showRatingHistory: false, showOnline: false } } });
    const other = await call<PublicProfile>('GET', '/api/profiles/carol');
    expect(other.data.recentGames).toBeNull();
    expect(other.data.online).toBeNull();
    expect((await call('GET', '/api/profiles/carol/rating-history?category=blitz')).status).toBe(403);
    const own = await call<PublicProfile>('GET', '/api/profiles/carol', { token });
    expect(own.data.recentGames).toEqual([]);
    expect((await call('GET', '/api/profiles/carol/rating-history?category=blitz', { token })).status).toBe(200);
  });

  it('deletes the account after a password confirmation', async () => {
    const token = 'dev:u4:dave';
    await call('PATCH', '/api/me/profile', { token, body: { bio: 'bye' } });
    expect((await call('POST', '/api/me/delete', { token, body: {} })).status).toBe(400);
    expect((await call('POST', '/api/me/delete', { token, body: { password: 'pw' } })).status).toBe(200);
    expect((await call('GET', '/api/profiles/dave')).status).toBe(404);
  });

  it('answers CORS preflight', async () => {
    const res = await fetch(`${base}/api/me/settings`, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
  });
});

describe('SqliteProfileStore', () => {
  it('round-trips a profile and fills settings added later', () => {
    const db = new DatabaseSync(':memory:');
    const store = new SqliteProfileStore(db);
    const rec = { userId: 'u', displayName: 'U', bio: null, country: 'DE', avatar: { id: 'rook' as const, tone: 'silver' as const }, settings: DEFAULT_SETTINGS, updatedAt: 1 };
    store.save(rec);
    expect(store.get('u')).toEqual(rec);
    db.prepare('UPDATE user_profiles SET settings = ? WHERE user_id = ?').run(JSON.stringify({ board: { theme: 'marble' } }), 'u');
    expect(store.get('u')!.settings.board.theme).toBe('marble');
    expect(store.get('u')!.settings.sound).toEqual(DEFAULT_SETTINGS.sound);
    store.delete('u');
    expect(store.get('u')).toBeUndefined();
  });
});
