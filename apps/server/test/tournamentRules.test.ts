import { createUser, openDb, type DbHandle } from '@chessmate/db';
import type { GameOutcome, TournamentSettings } from '@chessmate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TournamentService, type TournamentBridge } from '../src/tournaments/service';

let h: DbHandle;
let clock = Date.UTC(2026, 10, 20, 9, 0);
const now = () => clock;
const users: string[] = [];

beforeAll(async () => {
  h = openDb({ path: 'memory://' });
  await h.migrate();
  for (let i = 0; i < 5; i++) users.push((await createUser(h.db, { username: `rules${i}` })).id);
}, 60_000);

afterAll(async () => {
  await h.close();
});

/** A game server stand-in: everyone is online; games run until the test ends them. */
function harness(svc: TournamentService) {
  const games = new Map<string, { white: string; black: string; frenzy: boolean }>();
  const busy = new Set<string>();
  let n = 0;
  const bridge: TournamentBridge = {
    isOnline: () => true,
    liveGameOf: (id) => (busy.has(id) ? 'busy' : null),
    rating: (id) => ({ rating: 1500 + users.indexOf(id) * 10, games: 50 }),
    startGame: (white, black, _tc, _rated, _tid, frenzy) => {
      const id = `g${++n}`;
      games.set(id, { white, black, frenzy: !!frenzy });
      busy.add(white).add(black);
      return id;
    },
    notify: () => {},
  };
  svc.attach(bridge, 1e9);
  /** Ends the live game of `winner` (or of both players for a draw). */
  const end = (tid: string, gameId: string, winner: string | null, frenzy = { w: false, b: false }) => {
    const g = games.get(gameId)!;
    games.delete(gameId);
    busy.delete(g.white);
    busy.delete(g.black);
    const outcome = { winner: winner === null ? null : winner === g.white ? 'w' : 'b', reason: winner === null ? 'draw_agreement' : 'resignation', result: winner === null ? '1/2-1/2' : winner === g.white ? '1-0' : '0-1' } as GameOutcome;
    svc.gameEnded(tid, gameId, outcome, frenzy);
  };
  return { games, end };
}

async function newTournament(svc: TournamentService, settings: Partial<TournamentSettings>, players: string[]) {
  const t = await svc.create({ name: 'Rules cup', timeControl: { initialMs: 180_000, incrementMs: 0 }, startsAt: clock + 60_000, durationMinutes: 30, settings }, 'staff');
  for (const id of players) await svc.join(id, t.id, { acceptRules: true });
  await svc.startNow(t.id);
  return t.id;
}

describe('tournament rules', () => {
  it('arena: streak options and frenzy change the points', async () => {
    const svc = new TournamentService({ db: h.db, now });
    const { games, end } = harness(svc);
    const [a, b] = users as [string, string];
    const id = await newTournament(svc, { winStreak: true, drawStreak: true, lossStreak: true, frenzy: true }, [a, b]);
    expect([...games.values()][0]!.frenzy).toBe(true);
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        clock += 5_000;
        svc.tick();
      }
      const [gameId, g] = [...games.entries()][0]!;
      const aColor = g.white === a ? 'w' : 'b';
      // A goes frenzy in the third game.
      end(id, gameId, a, i === 2 ? { w: aColor === 'w', b: aColor === 'b' } : { w: false, b: false });
    }
    const s = svc.detail(null, id).standings;
    // A: 2 + 2 + (4 on a streak + 1 frenzy). B: 0, 0, then -1 (kept at 0).
    expect(s.find((x) => x.userId === a)).toMatchObject({ score: 9, onFire: true, wins: 3 });
    expect(s.find((x) => x.userId === b)).toMatchObject({ score: 0, losses: 3 });
    svc.stop();
  });

  it('arena "End by timer": games running at the end do not count', async () => {
    const svc = new TournamentService({ db: h.db, now });
    const { games, end } = harness(svc);
    const [a, b] = users as [string, string];
    const id = await newTournament(svc, { endMode: 'timer' }, [a, b]);
    clock += 31 * 60_000;
    svc.tick();
    expect(svc.detail(null, id).status).toBe('finished');
    end(id, [...games.keys()][0]!, a);
    expect(svc.detail(null, id).standings.every((x) => x.score === 0)).toBe(true);
    svc.stop();
  });

  it('arena "Wait for all games": the last games finish and count', async () => {
    const svc = new TournamentService({ db: h.db, now });
    const { games, end } = harness(svc);
    const [a, b] = users as [string, string];
    const id = await newTournament(svc, { endMode: 'wait' }, [a, b]);
    clock += 31 * 60_000;
    svc.tick();
    expect(svc.detail(null, id)).toMatchObject({ status: 'running', finishing: true });
    end(id, [...games.keys()][0]!, a);
    svc.tick();
    const d = svc.detail(null, id);
    expect(d.status).toBe('finished');
    expect(d.standings[0]).toMatchObject({ userId: a, score: 2 });
    svc.stop();
  });

  it('swiss: fixed rounds, no rematches, byes, half points and Buchholz', async () => {
    const svc = new TournamentService({ db: h.db, now });
    const { games, end } = harness(svc);
    const id = await newTournament(svc, { format: 'swiss', rounds: 3 }, users);
    const met = new Set<string>();
    for (let round = 1; round <= 3; round++) {
      expect(svc.detail(null, id).round).toBe(round);
      // Five players: two games and one bye each round.
      expect(games.size).toBe(2);
      let first = true;
      for (const [gameId, g] of [...games.entries()]) {
        const key = [g.white, g.black].sort().join(':');
        expect(met.has(key)).toBe(false);
        met.add(key);
        end(id, gameId, first ? null : g.white);
        first = false;
      }
      svc.tick();
      expect(games.size).toBe(0); // a break between rounds
      clock += 16_000;
      svc.tick();
    }
    const d = svc.detail(null, id);
    expect(d.status).toBe('finished');
    const total = d.standings.reduce((sum, s) => sum + s.score, 0);
    // Each round: a draw (1), a decisive game (1) and a bye (1).
    expect(total).toBe(9);
    expect(d.standings.every((s) => (s.byes ?? 0) <= 1)).toBe(true);
    expect(d.standings.every((s) => typeof s.buchholz === 'number')).toBe(true);
    svc.stop();
  });
});
