import { friendships, openDb, ratings, userProfiles, users, type DbHandle } from '@chessmate/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbLeaderboardSource, LeaderboardError, Leaderboards, MemoryLeaderboardSource } from '../src/leaderboard';
import { MemoryPlayerStore } from '../src/players';
import { ChessServer } from '../src/server';

let h: DbHandle;
let boards: Leaderboards;

beforeAll(async () => {
  h = openDb({ url: '', path: 'memory://' });
  await h.migrate();
  const db = h.db;
  const add = async (id: string, country: string | null, rating: number, rd = 60, games = 30, category: 'blitz' | 'bullet' = 'blitz') => {
    await db.insert(users).values({ id, username: id, displayName: id.toUpperCase(), country }).onConflictDoNothing();
    await db.insert(ratings).values({ userId: id, category, rating, rd, volatility: 0.06, games, wins: 10, losses: 10, draws: 10, peak: rating + 50 });
  };
  await add('ana', 'US', 2100);
  await add('ben', 'US', 1900.4);
  await add('cai', 'DE', 1899.6); // rounds to 1900: ties with ben
  await add('dee', 'DE', 1700);
  await add('eve', 'US', 2400, 300); // provisional: hidden from global/country
  await add('fox', null, 1600, 60, 0); // no games: never ranked
  await add('ana', 'US', 1500, 60, 5, 'bullet');
  await add('gon', 'US', 2600);
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, 'gon')); // deleted account: never ranked
  await db.insert(friendships).values([
    { requesterId: 'dee', addresseeId: 'ana', status: 'accepted' },
    { requesterId: 'eve', addresseeId: 'dee', status: 'accepted' },
    { requesterId: 'dee', addresseeId: 'ben', status: 'pending' }, // not a friend yet
  ]);
  boards = new Leaderboards(new DbLeaderboardSource(db));
});
afterAll(() => h.close());

describe('Leaderboards (Postgres)', () => {

  it('ranks the global board with shared ranks for ties and hides provisional players', async () => {
    const p = await boards.get({ category: 'blitz', scope: 'global' });
    expect(p.total).toBe(4);
    expect(p.entries.map((e) => [e.rank, e.userId, e.rating])).toEqual([
      [1, 'ana', 2100],
      [2, 'ben', 1900],
      [2, 'cai', 1900],
      [4, 'dee', 1700],
    ]);
    expect(p.entries[0]).toMatchObject({ displayName: 'ANA', country: 'US', games: 30, peak: 2150, provisional: false });
  });

  it('separates categories', async () => {
    expect((await boards.get({ category: 'bullet', scope: 'global' })).entries.map((e) => e.userId)).toEqual(['ana']);
  });

  it('pages and still reports the viewer row when it is off the page', async () => {
    const p = await boards.get({ category: 'blitz', scope: 'global', limit: 2, offset: 0, viewerId: 'dee' });
    expect(p.entries).toHaveLength(2);
    expect(p.you).toMatchObject({ userId: 'dee', rank: 4 });
    const p2 = await boards.get({ category: 'blitz', scope: 'global', limit: 2, offset: 2 });
    expect(p2.entries.map((e) => e.userId)).toEqual(['cai', 'dee']);
  });

  it('filters by country, defaulting to the viewer country', async () => {
    expect((await boards.get({ category: 'blitz', scope: 'country', country: 'de' })).entries.map((e) => [e.rank, e.userId])).toEqual([
      [1, 'cai'],
      [2, 'dee'],
    ]);
    const mine = await boards.get({ category: 'blitz', scope: 'country', viewerId: 'ben' });
    expect(mine.country).toBe('US');
    expect(mine.entries.map((e) => e.userId)).toEqual(['ana', 'ben']);
    await expect(boards.get({ category: 'blitz', scope: 'country' })).rejects.toThrow(LeaderboardError);
  });

  it('shows friends plus the viewer, provisional players included', async () => {
    const p = await boards.get({ category: 'blitz', scope: 'friends', viewerId: 'dee' });
    expect(p.entries.map((e) => [e.rank, e.userId, e.provisional])).toEqual([
      [1, 'eve', true],
      [2, 'ana', false],
      [3, 'dee', false],
    ]);
    expect(p.you?.rank).toBe(3);
    await expect(boards.get({ category: 'blitz', scope: 'friends' })).rejects.toThrow(/Sign in/);
  });

  it('gives each player their rank within their country', async () => {
    const p = await boards.get({ category: 'blitz', scope: 'global' });
    expect(p.entries.map((e) => [e.userId, e.country, e.countryRank])).toEqual([
      ['ana', 'US', 1],
      ['ben', 'US', 2],
      ['cai', 'DE', 1],
      ['dee', 'DE', 2],
    ]);
    const de = await boards.get({ category: 'blitz', scope: 'country', country: 'DE', viewerId: 'dee' });
    expect(de.you).toMatchObject({ userId: 'dee', countryRank: 2 });
  });

  it('takes country ranks on a friends board from the real country boards', async () => {
    const p = await boards.get({ category: 'blitz', scope: 'friends', viewerId: 'dee' });
    // eve is provisional, so she is not on the US board; dee is 2nd in DE, behind cai who is not a friend.
    expect(p.entries.map((e) => [e.userId, e.countryRank])).toEqual([
      ['eve', null],
      ['ana', 1],
      ['dee', 2],
    ]);
    expect(p.you).toMatchObject({ userId: 'dee', countryRank: 2 });
  });

  it('uses the country and name set on the profile', async () => {
    await h.db.insert(users).values({ id: 'hal', username: 'hal', country: null });
    await h.db.insert(ratings).values({ userId: 'hal', category: 'bullet', rating: 1400, rd: 60, volatility: 0.06, games: 9, wins: 3, losses: 3, draws: 3, peak: 1400 });
    await h.db.insert(userProfiles).values({ userId: 'hal', displayName: 'Hal 9000', country: 'de', avatar: {}, settings: {} });
    const fresh = new Leaderboards(new DbLeaderboardSource(h.db)); // the shared board caches pages for 15 s
    const p = await fresh.get({ category: 'bullet', scope: 'global' });
    expect(p.entries.find((e) => e.userId === 'hal')).toMatchObject({ displayName: 'Hal 9000', country: 'DE', countryRank: 1 });
    expect((await fresh.get({ category: 'bullet', scope: 'country', viewerId: 'hal' })).country).toBe('DE');
  });

  it('rejects unknown categories and clamps limits', async () => {
    await expect(boards.get({ category: 'nope' as never, scope: 'global' })).rejects.toThrow(/category/);
    expect((await boards.get({ category: 'blitz', scope: 'global', limit: 10_000 })).entries).toHaveLength(4);
  });
});

describe('Leaderboards (memory store)', () => {
  it('ranks non-guest players with a settled rating', async () => {
    const store = new MemoryPlayerStore();
    store.save({ id: 'p1', name: 'One', ratings: { rapid: { rating: 1800, rd: 80, volatility: 0.06 } } });
    store.save({ id: 'p2', name: 'Two', ratings: { rapid: { rating: 1600, rd: 340, volatility: 0.06 } } });
    store.save({ id: 'g_x', name: 'Guest', ratings: { rapid: { rating: 2500, rd: 50, volatility: 0.06 } } });
    const boards = new Leaderboards(new MemoryLeaderboardSource(() => store.all(), () => ['p2']));
    expect((await boards.get({ category: 'rapid', scope: 'global' })).entries.map((e) => e.userId)).toEqual(['p1']);
    expect((await boards.get({ category: 'rapid', scope: 'friends', viewerId: 'p1' })).entries.map((e) => e.userId)).toEqual(['p1', 'p2']);
  });
});

describe('HTTP API', () => {
  let server: ChessServer;
  let base: string;
  beforeAll(async () => {
    server = new ChessServer({ port: 0, leaderboards: boards, viewerFor: (t) => (t === 'tok-dee' ? 'dee' : null) });
    base = `http://localhost:${await server.listen()}`;
  });
  afterAll(() => server.close());

  it('serves live stats', async () => {
    const res = await fetch(`${base}/api/stats`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toMatchObject({ playersOnline: 0, gamesInProgress: 0, playersSeeking: 0 });
  });

  it('serves leaderboards with the viewer from the bearer token', async () => {
    const res = await fetch(`${base}/api/leaderboard?category=blitz&scope=friends`, { headers: { authorization: 'Bearer tok-dee' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.you.userId).toBe('dee');
    expect(body.entries).toHaveLength(3);
  });

  it('accepts account access tokens for the friends board', async () => {
    const auth = { verifyAccessToken: (t: string) => (t === 'jwt-for-dee' ? { userId: 'dee' } : null) };
    const signedIn = new ChessServer({ port: 0, leaderboards: boards, auth: auth as never });
    const url = `http://localhost:${await signedIn.listen()}`;
    try {
      const res = await fetch(`${url}/api/leaderboard?category=blitz&scope=friends`, { headers: { authorization: 'Bearer jwt-for-dee' } });
      expect(res.status).toBe(200);
      expect((await res.json()).you.userId).toBe('dee');
      expect((await fetch(`${url}/api/leaderboard?scope=friends`, { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    } finally {
      signedIn.close();
    }
  });

  it('returns 401 for a friends board without sign-in and 400 for bad input', async () => {
    expect((await fetch(`${base}/api/leaderboard?scope=friends`)).status).toBe(401);
    expect((await fetch(`${base}/api/leaderboard?category=chess960`)).status).toBe(400);
  });
});
