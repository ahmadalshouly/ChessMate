import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LeaderboardError, Leaderboards, MemoryLeaderboardSource, SqlLeaderboardSource } from '../src/leaderboard';
import { MemoryPlayerStore } from '../src/players';
import { ChessServer } from '../src/server';

// Same users/ratings columns as the accounts schema.
const SCHEMA = `
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, country TEXT, deleted_at INTEGER);
CREATE TABLE ratings (
  user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, rating REAL NOT NULL, rd REAL NOT NULL,
  volatility REAL NOT NULL, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, peak REAL NOT NULL,
  PRIMARY KEY (user_id, category));
`;

function seed() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(SCHEMA);
  const add = (id: string, country: string | null, rating: number, rd = 60, games = 30, category = 'blitz') => {
    sql.prepare('INSERT OR IGNORE INTO users (id, username, display_name, country) VALUES (?, ?, ?, ?)').run(id, id, id.toUpperCase(), country);
    sql.prepare('INSERT INTO ratings VALUES (?, ?, ?, ?, 0.06, ?, 10, 10, 10, ?)').run(id, category, rating, rd, games, rating + 50);
  };
  add('ana', 'US', 2100);
  add('ben', 'US', 1900.4);
  add('cai', 'DE', 1899.6); // rounds to 1900: ties with ben
  add('dee', 'DE', 1700);
  add('eve', 'US', 2400, 300); // provisional: hidden from global/country
  add('fox', null, 1600, 60, 0); // no games: never ranked
  add('ana', 'US', 1500, 60, 5, 'bullet');
  add('gon', 'US', 2600);
  sql.prepare('UPDATE users SET deleted_at = 1 WHERE id = ?').run('gon'); // deleted account: never ranked
  const friends: Record<string, string[]> = { dee: ['ana', 'eve'] };
  return { sql, boards: new Leaderboards(new SqlLeaderboardSource(sql, (id) => friends[id] ?? [])) };
}

describe('Leaderboards (SQLite)', () => {
  const { boards } = seed();

  it('ranks the global board with shared ranks for ties and hides provisional players', () => {
    const p = boards.get({ category: 'blitz', scope: 'global' });
    expect(p.total).toBe(4);
    expect(p.entries.map((e) => [e.rank, e.userId, e.rating])).toEqual([
      [1, 'ana', 2100],
      [2, 'ben', 1900],
      [2, 'cai', 1900],
      [4, 'dee', 1700],
    ]);
    expect(p.entries[0]).toMatchObject({ displayName: 'ANA', country: 'US', games: 30, peak: 2150, provisional: false });
  });

  it('separates categories', () => {
    expect(boards.get({ category: 'bullet', scope: 'global' }).entries.map((e) => e.userId)).toEqual(['ana']);
  });

  it('pages and still reports the viewer row when it is off the page', () => {
    const p = boards.get({ category: 'blitz', scope: 'global', limit: 2, offset: 0, viewerId: 'dee' });
    expect(p.entries).toHaveLength(2);
    expect(p.you).toMatchObject({ userId: 'dee', rank: 4 });
    const p2 = boards.get({ category: 'blitz', scope: 'global', limit: 2, offset: 2 });
    expect(p2.entries.map((e) => e.userId)).toEqual(['cai', 'dee']);
  });

  it('filters by country, defaulting to the viewer country', () => {
    expect(boards.get({ category: 'blitz', scope: 'country', country: 'de' }).entries.map((e) => [e.rank, e.userId])).toEqual([
      [1, 'cai'],
      [2, 'dee'],
    ]);
    const mine = boards.get({ category: 'blitz', scope: 'country', viewerId: 'ben' });
    expect(mine.country).toBe('US');
    expect(mine.entries.map((e) => e.userId)).toEqual(['ana', 'ben']);
    expect(() => boards.get({ category: 'blitz', scope: 'country' })).toThrow(LeaderboardError);
  });

  it('shows friends plus the viewer, provisional players included', () => {
    const p = boards.get({ category: 'blitz', scope: 'friends', viewerId: 'dee' });
    expect(p.entries.map((e) => [e.rank, e.userId, e.provisional])).toEqual([
      [1, 'eve', true],
      [2, 'ana', false],
      [3, 'dee', false],
    ]);
    expect(p.you?.rank).toBe(3);
    expect(() => boards.get({ category: 'blitz', scope: 'friends' })).toThrow(/Sign in/);
  });

  it('rejects unknown categories and clamps limits', () => {
    expect(() => boards.get({ category: 'nope' as never, scope: 'global' })).toThrow(/category/);
    expect(boards.get({ category: 'blitz', scope: 'global', limit: 10_000 }).entries).toHaveLength(4);
  });
});

describe('Leaderboards (memory store)', () => {
  it('ranks non-guest players with a settled rating', () => {
    const store = new MemoryPlayerStore();
    store.save({ id: 'p1', name: 'One', ratings: { rapid: { rating: 1800, rd: 80, volatility: 0.06 } } });
    store.save({ id: 'p2', name: 'Two', ratings: { rapid: { rating: 1600, rd: 340, volatility: 0.06 } } });
    store.save({ id: 'g_x', name: 'Guest', ratings: { rapid: { rating: 2500, rd: 50, volatility: 0.06 } } });
    const boards = new Leaderboards(new MemoryLeaderboardSource(() => store.all(), () => ['p2']));
    expect(boards.get({ category: 'rapid', scope: 'global' }).entries.map((e) => e.userId)).toEqual(['p1']);
    expect(boards.get({ category: 'rapid', scope: 'friends', viewerId: 'p1' }).entries.map((e) => e.userId)).toEqual(['p1', 'p2']);
  });
});

describe('HTTP API', () => {
  let server: ChessServer;
  let base: string;
  beforeAll(async () => {
    const { boards } = seed();
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

  it('returns 401 for a friends board without sign-in and 400 for bad input', async () => {
    expect((await fetch(`${base}/api/leaderboard?scope=friends`)).status).toBe(401);
    expect((await fetch(`${base}/api/leaderboard?category=chess960`)).status).toBe(400);
  });
});
