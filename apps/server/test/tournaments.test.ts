import { decodeServer, encode, outcomeFor, type ClientMessage, type GameOutcome, type ServerMessage } from '@chessmate/core';
import { openDb, type DbHandle } from '@chessmate/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AdminService } from '../src/admin';
import { AuthService, ConsoleMailer, DbAuthStore } from '../src/auth';
import { ChessServer } from '../src/server';
import { DbTournamentStore, TournamentService, type TournamentBridge } from '../src/tournaments';
import type { NotifyInput } from '../src/notifications/templates';

const T0 = Date.UTC(2026, 10, 20, 18);

function harness(opts: { store?: DbTournamentStore } = {}) {
  let now = T0;
  const games = new Map<string, { white: string; black: string }>();
  const notes: { userId: string; n: NotifyInput }[] = [];
  const offline = new Set<string>();
  const banned = new Set<string>();
  const ratings: Record<string, number> = { ann: 1800, ben: 1700, cid: 1600, dee: 1500, eve: 1400 };
  let seq = 0;
  const terminated: string[] = [];
  const svc = new TournamentService({ now: () => now, store: opts.store, log: () => {} });
  const bridge: TournamentBridge = {
    startGame: (_ref, _tc, _rated, w, b) => {
      const gameId = `g${++seq}`;
      games.set(gameId, { white: w, black: b });
      return { gameId, white: { id: w, username: w, rating: ratings[w] ?? 1500 }, black: { id: b, username: b, rating: ratings[b] ?? 1500 } };
    },
    isOnline: (id) => !offline.has(id),
    busy: (id) => [...games.entries()].some(([gid, g]) => (g.white === id || g.black === id) && svc.isTournamentGame(gid)),
    rating: (id) => ratings[id] ?? 1500,
    canPlay: (id) => !banned.has(id),
    terminate: (id) => terminated.push(id),
    notify: (userId, n) => notes.push({ userId, n }),
  };
  svc.attach(bridge);
  const admin = { userId: 'staff', username: 'staff' };
  const v = (name: string) => ({ userId: name, username: name });
  const end = (gameId: string, outcome: GameOutcome, plies = 20) => {
    svc.gameEnded(gameId, { outcome, plies, terminated: false });
    games.delete(gameId);
  };
  const live = () => [...games.entries()].filter(([id]) => svc.isTournamentGame(id));
  return {
    svc,
    admin,
    v,
    end,
    live,
    notes,
    offline,
    banned,
    terminated,
    advance: (ms: number) => {
      now += ms;
      svc.tick(now);
    },
    get now() {
      return now;
    },
  };
}

const arena = (over: Record<string, unknown> = {}) => ({
  name: 'Evening Arena',
  description: '',
  format: 'arena',
  timeControl: { initialMs: 180_000, incrementMs: 0 },
  rated: true,
  startsAt: T0 + 10 * 60_000,
  durationMinutes: 30,
  prizePool: { currency: 'USD', places: [{ place: 1, amount: 100 }, { place: 2, amount: 50 }] },
  ...over,
});

describe('tournament service', () => {
  it('registers players, reminds them, cancels when too few join', () => {
    const h = harness();
    const t = h.svc.create(arena(), h.admin);
    h.svc.join(h.v('ann'), t.id);
    expect(() => h.svc.join(h.v('ann'), t.id)).toThrow(/already/);
    expect(() => h.svc.join(h.v('g_guest'), t.id)).toThrow(/account/);
    h.advance(5 * 60_000 + 1);
    expect(h.notes.some((x) => x.userId === 'ann' && x.n.title.includes('starts soon'))).toBe(true);
    h.advance(5 * 60_000);
    expect(h.svc.detail(t.id, null).status).toBe('cancelled');
    expect(h.notes.some((x) => x.userId === 'ann' && x.n.title.includes('cancelled'))).toBe(true);
  });

  it('enforces rating limits and the player cap', () => {
    const h = harness();
    const t = h.svc.create(arena({ minRating: 1550, maxPlayers: 2 }), h.admin);
    expect(h.svc.detail(t.id, h.v('eve')).me?.joinBlock).toBe('rating_low');
    h.svc.join(h.v('ann'), t.id);
    h.svc.join(h.v('ben'), t.id);
    expect(h.svc.detail(t.id, h.v('cid')).me?.joinBlock).toBe('full');
    h.svc.leave(h.v('ben'), t.id);
    expect(h.svc.detail(t.id, h.v('cid')).me?.canJoin).toBe(true);
  });

  it('runs an arena: continuous pairing, streak bonus, prizes at the end', () => {
    const h = harness();
    const t = h.svc.create(arena(), h.admin);
    for (const p of ['ann', 'ben', 'cid', 'dee']) h.svc.join(h.v(p), t.id);
    h.advance(10 * 60_000);
    expect(h.svc.detail(t.id, null).status).toBe('running');
    h.advance(500);
    expect(h.live()).toHaveLength(2);
    // ann wins three in a row: 2 + 2 + 4.
    for (let i = 0; i < 3; i++) {
      const [gid, g] = h.live().find(([, g]) => g.white === 'ann' || g.black === 'ann')!;
      h.end(gid, outcomeFor('checkmate', g.white === 'ann' ? 'w' : 'b'));
      h.advance(3_500);
    }
    const ann = h.svc.detail(t.id, null).standings.find((s) => s.userId === 'ann')!;
    expect(ann.score).toBe(8);
    expect(ann.streak).toBe(3);
    expect(ann.rank).toBe(1);
    // Time runs out; the last games finish in overtime, then results are final.
    h.advance(30 * 60_000);
    expect(h.svc.detail(t.id, null).status).toBe('running');
    for (const [gid] of h.live()) h.end(gid, outcomeFor('draw_agreement', null));
    h.advance(500);
    const done = h.svc.detail(t.id, h.v('ann'));
    expect(done.status).toBe('finished');
    expect(done.winner?.username).toBe('ann');
    expect(done.standings[0]!.prize).toMatchObject({ place: 1, amount: 100, currency: 'USD', paidAt: null });
    expect(h.notes.some((x) => x.userId === 'ann' && /finished 1st of 4.*100 USD/.test(x.n.body))).toBe(true);
    // Staff record the payout.
    h.svc.setPrizePaid(t.id, 'ann', true);
    expect(h.svc.detail(t.id, null).standings[0]!.prize?.paidAt).toBe(h.now);
  });

  it('pauses arena players who do not move and lets them come back', () => {
    const h = harness();
    const t = h.svc.create(arena(), h.admin);
    for (const p of ['ann', 'ben']) h.svc.join(h.v(p), t.id);
    h.advance(10 * 60_000);
    h.advance(500);
    const [gid] = h.live()[0]!;
    h.end(gid, outcomeFor('aborted', null), 0);
    const d = h.svc.detail(t.id, null);
    const white = h.svc.detail(t.id, null).pairings[0]!.white.id;
    expect(d.standings.find((s) => s.userId === white)!.status).toBe('paused');
    expect(d.standings.every((s) => s.score === 0)).toBe(true);
    expect(h.svc.join(h.v(white), t.id).me?.status).toBe('active');
  });

  it('runs a swiss: rounds, bye, forfeits, no rematches, Buchholz', () => {
    const h = harness();
    const t = h.svc.create(arena({ format: 'swiss', rounds: 3, durationMinutes: undefined }), h.admin);
    for (const p of ['ann', 'ben', 'cid', 'dee', 'eve']) h.svc.join(h.v(p), t.id);
    h.svc.startNow(t.id);
    expect(h.svc.detail(t.id, null).currentRound).toBe(1);
    expect(h.live()).toHaveLength(2);
    const met = new Set<string>();
    for (let round = 1; round <= 3; round++) {
      const d = h.svc.detail(t.id, null);
      // Five players give a bye; after the round-2 no-show withdraws, four are left and nobody sits out.
      expect(d.pairings.filter((p) => p.round === round && p.result === 'bye')).toHaveLength(round === 3 ? 0 : 1);
      const noShowGame = round === 2 ? h.live()[0]![0] : null;
      for (const [gid, g] of h.live()) {
        const key = [g.white, g.black].sort().join('-');
        expect(met.has(key)).toBe(false);
        met.add(key);
        // Higher rating wins, except one no-show in round 2.
        if (gid === noShowGame) h.end(gid, outcomeFor('aborted', null), 1);
        else h.end(gid, outcomeFor('checkmate', (({ ann: 5, ben: 4, cid: 3, dee: 2, eve: 1 }) as Record<string, number>)[g.white]! > (({ ann: 5, ben: 4, cid: 3, dee: 2, eve: 1 }) as Record<string, number>)[g.black]! ? 'w' : 'b'));
      }
      h.advance(500);
      if (round < 3) {
        expect(h.svc.detail(t.id, null).nextRoundAt).not.toBeNull();
        h.advance(15_000);
      }
    }
    const d = h.svc.detail(t.id, null);
    expect(d.status).toBe('finished');
    const forfeits = d.pairings.filter((p) => p.result === '+-');
    expect(forfeits).toHaveLength(1);
    // The player who did not move in round 2 was withdrawn and not paired again.
    const noShow = forfeits[0]!.black!.id;
    expect(d.standings.find((s) => s.userId === noShow)!.status).toBe('withdrawn');
    expect(d.pairings.filter((p) => p.round === 3 && (p.white.id === noShow || p.black?.id === noShow))).toHaveLength(0);
    const scores = d.standings.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(d.winner).not.toBeNull();
  });

  it('lets staff edit, start early, remove players and cancel', () => {
    const h = harness();
    const t = h.svc.create(arena(), h.admin);
    expect(() => h.svc.startNow(t.id)).toThrow(/2 players/);
    h.svc.update(t.id, { name: 'Renamed Arena', durationMinutes: 45 });
    expect(h.svc.detail(t.id, null)).toMatchObject({ name: 'Renamed Arena', durationMinutes: 45 });
    for (const p of ['ann', 'ben', 'cid']) h.svc.join(h.v(p), t.id);
    h.svc.startNow(t.id);
    expect(() => h.svc.update(t.id, { durationMinutes: 60 })).toThrow(/Only the name/);
    expect(h.svc.update(t.id, { prizePool: { currency: 'EUR', places: [{ place: 1, amount: 20 }] } }).changed).toEqual(['prizePool']);
    h.advance(500);
    const [gid, g] = h.live()[0]!;
    h.svc.removePlayer(t.id, g.white, 'Abusive chat');
    expect(h.terminated).toContain(gid);
    expect(() => h.svc.join(h.v(g.white), t.id)).toThrow(/removed/);
    h.svc.cancel(t.id, 'Server maintenance');
    expect(h.svc.detail(t.id, null)).toMatchObject({ status: 'cancelled', cancelReason: 'Server maintenance' });
  });
});

describe('tournament storage', () => {
  let db: DbHandle;
  beforeAll(async () => {
    db = openDb({ path: 'memory://' });
    await db.migrate();
  }, 60_000);
  afterAll(() => db.close());

  it('saves and reloads tournaments; games live at a restart become void', async () => {
    const store = new DbTournamentStore(db.db);
    const h = harness({ store });
    const t = h.svc.create(arena({ format: 'swiss', rounds: 2, durationMinutes: undefined }), h.admin);
    for (const p of ['ann', 'ben', 'cid', 'dee']) h.svc.join(h.v(p), t.id);
    h.svc.startNow(t.id);
    const [first] = h.live();
    h.end(first![0], outcomeFor('resignation', 'w'));
    await store.flush();

    const again = new TournamentService({ store: new DbTournamentStore(db.db), now: () => h.now, log: () => {} });
    await again.load();
    const d = again.detail(t.id, null);
    expect(d).toMatchObject({ name: 'Evening Arena', format: 'swiss', status: 'running', currentRound: 1, players: 4 });
    expect(d.prizePool?.places).toHaveLength(2);
    expect(d.pairings.map((p) => p.result).sort()).toEqual(['1-0', 'void']);
    expect(d.standings[0]!.score).toBe(1);
  });
});

describe('tournaments over HTTP and WebSocket', () => {
  const SECRET = 'test-secret-test-secret-test-secret!';
  let db: DbHandle;
  let server: ChessServer;
  let base: string;
  let port: number;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    db = openDb({ path: 'memory://' });
    await db.migrate();
    const auth = new AuthService({ store: new DbAuthStore(db.db), mailer: new ConsoleMailer(), secret: SECRET });
    for (const u of ['boss', 'pia', 'quin']) tokens[u] = (await auth.signup({ username: u, email: `${u}@example.com`, password: 'correct horse battery' })).tokens.accessToken;
    const tournaments = new TournamentService({ store: new DbTournamentStore(db.db), log: () => {} });
    const admin = new AdminService({ db: db.db, auth, tournaments, log: () => {} });
    await admin.load(['boss']);
    server = new ChessServer({ port: 0, matchIntervalMs: 20, auth, admin, tournaments, fairPlay: { analyzer: null, log: () => {} } });
    port = await server.listen();
    base = `http://localhost:${port}`;
  }, 60_000);
  afterAll(async () => {
    await server.close();
    await db.close();
  });

  const call = async (as: string | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(as ? { authorization: `Bearer ${tokens[as]}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  function player(token: string) {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const inbox: ServerMessage[] = [];
    ws.on('message', (d) => inbox.push(decodeServer(String(d))!));
    const next = async <T extends ServerMessage['t']>(t: T): Promise<Extract<ServerMessage, { t: T }>> => {
      for (let i = 0; i < 200; i++) {
        const k = inbox.findIndex((m) => m.t === t);
        if (k >= 0) return inbox.splice(k, 1)[0] as never;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`timeout waiting for ${t}`);
    };
    return new Promise<{ send: (m: ClientMessage) => void; next: typeof next; close: () => void }>((res) =>
      ws.on('open', () => {
        ws.send(encode({ t: 'hello', v: 1, token }));
        res({ send: (m) => ws.send(encode(m)), next, close: () => ws.close() });
      }),
    );
  }

  it('staff create, players join and play, results reach the standings', async () => {
    expect((await call('pia', 'POST', '/api/admin/tournaments', arena())).status).toBe(403);
    const bad = await call('boss', 'POST', '/api/admin/tournaments', arena({ name: 'x' }));
    expect(bad.body.error.field).toBe('name');
    const created = await call('boss', 'POST', '/api/admin/tournaments', arena({ startsAt: Date.now() + 3600_000 }));
    expect(created.status).toBe(200);
    const id = created.body.tournament.id as string;

    const list = await call(null, 'GET', '/api/tournaments');
    expect(list.body.upcoming.map((t: { id: string }) => t.id)).toContain(id);
    expect((await call(null, 'POST', `/api/tournaments/${id}/join`)).status).toBe(401);

    const [pia, quin] = await Promise.all([player(tokens.pia!), player(tokens.quin!)]);
    await Promise.all([pia.next('welcome'), quin.next('welcome')]);
    expect((await call('pia', 'POST', `/api/tournaments/${id}/join`)).body.tournament.me.status).toBe('active');
    await call('quin', 'POST', `/api/tournaments/${id}/join`);
    expect((await call('boss', 'POST', `/api/admin/tournaments/${id}/start`)).body.tournament.status).toBe('running');

    const [a, b] = await Promise.all([pia.next('gameStart'), quin.next('gameStart')]);
    expect(a.game.tournament).toMatchObject({ id, name: 'Evening Arena' });
    const white = a.you === 'w' ? pia : quin;
    const black = a.you === 'w' ? quin : pia;
    // No aborting tournament games: the side that does not move forfeits instead.
    black.send({ t: 'abort', gameId: a.game.gameId });
    white.send({ t: 'move', gameId: b.game.gameId, uci: 'e2e4', ply: 0 });
    await black.next('moved');
    black.send({ t: 'resign', gameId: a.game.gameId });
    const over = await white.next('gameOver');
    expect(over.outcome.reason).toBe('resignation');

    const detail = await call('pia', 'GET', `/api/tournaments/${id}`);
    const top = detail.body.tournament.standings[0];
    expect(top.score).toBe(2);
    expect(detail.body.tournament.pairings[0].result).toMatch(/^(1-0|0-1)$/);

    const done = await call('boss', 'POST', `/api/admin/tournaments/${id}/finish`);
    expect(done.body.tournament.status).toBe('finished');
    expect(done.body.tournament.winner.id).toBe(top.userId);
    const paid = await call('boss', 'POST', `/api/admin/tournaments/${id}/prize`, { userId: top.userId, paid: true });
    expect(paid.body.tournament.prizesPaid).toBe(1);
    const audit = await call('boss', 'GET', `/api/admin/audit?action=tournament.`);
    expect(audit.body.entries.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(['tournament.create', 'tournament.start', 'tournament.finish', 'tournament.prize_paid']));
    pia.close();
    quin.close();
  }, 20_000);
});
