import { Game, outcomeFor } from '@chessmate/core';
import { addMove, createGame, createUser, finishGame, openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AwardsService, gameFacts } from '../src/awards/service';
import { ChessServer } from '../src/server';

let h: DbHandle;
let alice: string;
let bob: string;

/** Stores a finished game with its moves, as the server does. */
async function storeGame(id: string, white: string, black: string, uci: string[], winner: 'w' | 'b' | null, reason: 'checkmate' | 'resignation') {
  const g = new Game();
  await createGame(h.db, { id, white: { id: white, name: white }, black: { id: black, name: black }, timeControl: { initialMs: 180_000, incrementMs: 0 }, rated: true, initialFen: g.fen, startedAt: new Date() });
  for (const m of uci) {
    const played = g.move(m)!;
    await addMove(h.db, id, { ply: g.ply, uci: played.uci, san: played.san, fenAfter: played.fenAfter, whiteMs: 1, blackMs: 1 });
  }
  await finishGame(h.db, id, { outcome: outcomeFor(reason, winner), pgn: '', finalFen: g.fen, plyCount: g.ply, ratingsAfter: { w: 1520, b: 1480 } });
}

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  alice = (await createUser(h.db, { username: 'awardsalice', country: 'NL' })).id;
  bob = (await createUser(h.db, { username: 'awardsbob', country: 'DE' })).id;
  // Bob mates Alice with fool's mate before awards existed.
  await storeGame('old1', alice, bob, ['f2f3', 'e7e5', 'g2g4', 'd8h4'], 'b', 'checkmate');
}, 60_000);

afterAll(async () => {
  await h.close();
});

describe('awards service', () => {
  it('builds awards from past games, dated by the game that earned them', async () => {
    const svc = new AwardsService({ db: h.db });
    const v = await svc.view(bob);
    const ids = v.earned.map((e) => `${e.id}:${e.level}`);
    expect(ids).toEqual(expect.arrayContaining(['games.won:1', 'mates.total:1', 'mate.queen:1', 'mate.quick:1', 'rating.blitz:1']));
    expect(v.earned.every((e) => e.gameId === 'old1')).toBe(true);
    expect(v.countries).toEqual(['NL']);
    const won = v.progress.find((p) => p.id === 'games.won')!;
    expect(won).toMatchObject({ level: 1, value: 1 });
    // Alice lost: no wins, but she played someone from Germany.
    const a = await svc.view(alice);
    expect(a.earned).toEqual([]);
    expect(a.countries).toEqual(['DE']);
  });

  it('counts a live game once and reports what it unlocked', async () => {
    const svc = new AwardsService({ db: h.db });
    const unlocked: string[] = [];
    svc.attach({ earned: (_u, earned) => unlocked.push(...earned.map((e) => `${e.id}:${e.level}`)) });
    // Alice wins a smothered mate; the game is already stored (the live path excludes it from the rebuild).
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'd7d6', 'b1c3', 'c8g4', 'f3e5', 'g4d1', 'c4f7', 'e8e7', 'c3d5'];
    await storeGame('live1', alice, bob, moves, 'w', 'checkmate');
    const g = Game.fromUciMoves(moves);
    const room = { id: 'live1', initialFen: g.startFen, timeControl: { initialMs: 180_000, incrementMs: 0 }, game: g };
    const facts = gameFacts(room, outcomeFor('checkmate', 'w'), 'w', 1530, bob);
    expect(facts.mateTypes).toContain('knight');
    expect(facts.openingName).toBeTruthy();
    const earned = await svc.gameFinished(alice, facts);
    expect(earned.map((e) => e.id)).toEqual(expect.arrayContaining(['games.won', 'mates.total', 'mate.knight']));
    expect(unlocked.length).toBe(earned.length);
    // Rebuilt history (old1) plus this game: two games, one win.
    const v = await svc.view(alice);
    expect(v.progress.find((p) => p.id === 'games.won')!.value).toBe(1);
    // A second service reads the saved counters instead of rebuilding.
    const again = await new AwardsService({ db: h.db }).view(alice);
    expect(again.progress.find((p) => p.id === 'games.won')!.value).toBe(1);
    expect(again.countriesBeaten).toEqual(['DE']);
  });
});

describe('awards API through the full server', () => {
  let server: ChessServer;
  let base: string;
  beforeAll(async () => {
    server = new ChessServer({ port: 0, awards: new AwardsService({ db: h.db }) });
    base = `http://localhost:${await server.listen()}`;
  });
  afterAll(() => server.close());

  it('serves a player by username and needs sign-in for your own', async () => {
    const res = await fetch(`${base}/api/awards?user=awardsbob`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { awards: { earned: unknown[] } };
    expect(body.awards.earned.length).toBeGreaterThan(0);
    expect((await fetch(`${base}/api/awards?user=nobody-here`)).status).toBe(404);
    expect((await fetch(`${base}/api/awards`)).status).toBe(401);
  });
});
