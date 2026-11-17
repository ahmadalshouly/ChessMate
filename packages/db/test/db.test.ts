import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  UniqueViolation,
  addMove,
  createGame,
  createUser,
  findUserByUsername,
  finishGame,
  getGame,
  getRating,
  getRatings,
  listUserGames,
  openDb,
  saveRating,
  type DbHandle,
} from '../src';

let h: DbHandle;
beforeAll(async () => {
  // Set TEST_DATABASE_URL to run against a real Postgres (use a throwaway database).
  h = openDb({ url: process.env.TEST_DATABASE_URL ?? '', path: 'memory://' });
  await h.migrate();
});
afterAll(() => h.close());

describe('db', () => {
  it('creates users with case-insensitive unique usernames and lowercased emails', async () => {
    const u = await createUser(h.db, { username: 'Magnus', email: 'M@Example.com', passwordHash: 'x' });
    expect(u.email).toBe('m@example.com');
    expect((await findUserByUsername(h.db, 'magnus'))?.id).toBe(u.id);
    await expect(createUser(h.db, { username: 'MAGNUS' })).rejects.toBeInstanceOf(UniqueViolation);
    await expect(createUser(h.db, { username: 'other', email: 'm@example.com' })).rejects.toMatchObject({ field: 'email' });
  });

  it('stores ratings per category with counters and history', async () => {
    const u = await createUser(h.db, { username: 'rated' });
    expect(await getRating(h.db, u.id, 'blitz')).toEqual({ rating: 1500, rd: 350, volatility: 0.06 });
    await saveRating(h.db, { userId: u.id, category: 'blitz', rating: { rating: 1620, rd: 290, volatility: 0.06 }, score: 1 });
    await saveRating(h.db, { userId: u.id, category: 'blitz', rating: { rating: 1580, rd: 260, volatility: 0.06 }, score: 0 });
    const [r] = await getRatings(h.db, u.id);
    expect(r).toMatchObject({ category: 'blitz', rating: 1580, games: 2, wins: 1, losses: 1, peak: 1620 });
  });

  it('persists a game with moves and result, guests stored by name', async () => {
    const w = await createUser(h.db, { username: 'whiteplayer' });
    await createGame(h.db, {
      id: 'g1',
      white: { id: w.id, name: 'whiteplayer', rating: 1500 },
      black: { id: 'g_guest', name: 'Guest' },
      timeControl: { initialMs: 180_000, incrementMs: 2000 },
      rated: false,
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });
    await addMove(h.db, 'g1', { ply: 1, uci: 'e2e4', san: 'e4', fenAfter: 'x', whiteMs: 180_000, blackMs: 180_000 });
    await finishGame(h.db, 'g1', {
      outcome: { result: '0-1', reason: 'resignation', winner: 'b' },
      pgn: '1. e4 0-1',
      finalFen: 'x',
      plyCount: 1,
    });
    const g = await getGame(h.db, 'g1');
    expect(g).toMatchObject({ whiteUserId: w.id, blackUserId: null, blackName: 'Guest', timeCategory: 'blitz', status: 'finished', result: '0-1' });
    expect(g!.moves.map((m) => m.san)).toEqual(['e4']);
    expect((await listUserGames(h.db, w.id)).map((x) => x.id)).toEqual(['g1']);
  });
});
