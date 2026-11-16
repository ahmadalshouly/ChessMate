import { parseTimeControl } from '@chessmate/core';
import { describe, expect, it } from 'vitest';
import { Matchmaker } from '../src/matchmaker';
import { RatingService, type FinishedGame } from '../src/ratingService';

const T0 = Date.UTC(2026, 0, 1);
const blitz = parseTimeControl('3+2');

function game(over: Partial<FinishedGame> = {}): FinishedGame {
  return {
    gameId: 'g1',
    rated: true,
    whiteId: 'alice',
    blackId: 'bob',
    whiteIsGuest: false,
    blackIsGuest: false,
    timeControl: blitz,
    reason: 'checkmate',
    winner: 'w',
    plies: 40,
    endedAt: T0,
    ...over,
  };
}

describe('RatingService', () => {
  it('rates a game, stores both ratings and writes history', () => {
    const s = new RatingService();
    const res = s.applyGame(game());
    expect(res.rated).toBe(true);
    if (!res.rated) return;
    expect(res.category).toBe('blitz');
    expect(s.get('alice', 'blitz', T0).rating).toBeGreaterThan(1500);
    expect(s.get('bob', 'blitz', T0).rating).toBeLessThan(1500);
    const h = s.history('alice', 'blitz');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ sourceId: 'g1', opponentId: 'bob', score: 1, delta: res.w.delta });
  });

  it('keeps categories separate', () => {
    const s = new RatingService();
    s.applyGame(game());
    expect(s.get('alice', 'bullet', T0).rating).toBe(1500);
    expect(s.get('alice', 'rapid', T0).games).toBe(0);
    const all = s.all('alice', T0);
    expect(all.blitz.games).toBe(1);
    expect(all.puzzle.provisional).toBe(true);
  });

  it('is idempotent per game id', () => {
    const s = new RatingService();
    s.applyGame(game());
    const r1 = s.get('alice', 'blitz', T0).rating;
    expect(s.applyGame(game())).toEqual({ rated: false, reason: 'already_rated' });
    expect(s.get('alice', 'blitz', T0).rating).toBe(r1);
  });

  it('does not touch ratings for casual, aborted or guest games', () => {
    const s = new RatingService();
    expect(s.applyGame(game({ rated: false }))).toEqual({ rated: false, reason: 'casual' });
    expect(s.applyGame(game({ reason: 'aborted', gameId: 'g2' }))).toEqual({ rated: false, reason: 'aborted' });
    expect(s.applyGame(game({ blackIsGuest: true, gameId: 'g3' }))).toEqual({ rated: false, reason: 'guest' });
    expect(s.get('alice', 'blitz', T0).games).toBe(0);
    expect(s.history('alice', 'blitz')).toEqual([]);
  });

  it('history can be limited and filtered by time', () => {
    const s = new RatingService();
    for (let i = 0; i < 5; i++) s.applyGame(game({ gameId: `g${i}`, endedAt: T0 + i * 1000, winner: i % 2 ? 'b' : 'w' }));
    expect(s.history('alice', 'blitz')).toHaveLength(5);
    expect(s.history('alice', 'blitz', { limit: 2 }).map((e) => e.sourceId)).toEqual(['g3', 'g4']);
    expect(s.history('alice', 'blitz', { since: T0 + 3000 })).toHaveLength(2);
    expect(s.get('alice', 'blitz', T0 + 5000)).toMatchObject({ games: 5, wins: 3, losses: 2 });
  });

  it('rates puzzles once per puzzle and returns the new puzzle rating', () => {
    const s = new RatingService();
    const puzzle = { rating: 1400, rd: 80, volatility: 0.06 };
    const res = s.applyPuzzle('alice', 'p1', puzzle, true, T0);
    expect(res?.player.delta).toBeGreaterThan(0);
    expect(res?.puzzle.rating).toBeLessThan(1400);
    expect(s.applyPuzzle('alice', 'p1', puzzle, true, T0)).toBeNull();
    expect(s.get('alice', 'puzzle', T0).games).toBe(1);
    expect(s.get('alice', 'blitz', T0).games).toBe(0);
  });

  it('gives provisional players a wider matchmaking window', () => {
    const s = new RatingService();
    for (let i = 0; i < 30; i++) s.applyGame(game({ gameId: `g${i}`, endedAt: T0 + i, winner: i % 2 ? 'b' : 'w' }));
    expect(s.gapFor('alice', blitz, 0, T0 + 100)).toBe(100);
    expect(s.gapFor('newbie', blitz, 0, T0)).toBeGreaterThan(300);
  });
});

describe('Matchmaker with RD', () => {
  it('pairs a provisional player across a wider gap immediately', () => {
    const m = new Matchmaker();
    m.add({ playerId: 'new', rating: 1500, rd: 350, timeControl: blitz, rated: true, createdAt: 0 });
    m.add({ playerId: 'vet', rating: 1750, rd: 350, timeControl: blitz, rated: true, createdAt: 0 });
    expect(m.tick(0)).toHaveLength(1);
    const m2 = new Matchmaker();
    m2.add({ playerId: 'a', rating: 1500, rd: 60, timeControl: blitz, rated: true, createdAt: 0 });
    m2.add({ playerId: 'b', rating: 1750, rd: 60, timeControl: blitz, rated: true, createdAt: 0 });
    expect(m2.tick(0)).toHaveLength(0);
  });
});
