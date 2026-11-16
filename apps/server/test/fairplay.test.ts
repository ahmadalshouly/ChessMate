import { Game, type Score } from '@chessmate/core';
import { describe, expect, it } from 'vitest';
import {
  ConnectionLimiter,
  DEFAULT_RATE_LIMITS,
  FairPlayService,
  IpLimiter,
  TokenBucket,
  UciEngine,
  assessPlayer,
  evaluateGame,
  reportsFromEvals,
  validateClientMessage,
  type Analyzer,
  type FinishedGame,
  type SideReport,
} from '../src/fairplay';
import { MemoryPlayerStore } from '../src/players';

/** Deterministic pseudo-random legal game. */
function randomGame(plies: number, seed = 7): string[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (;;) {
    const g = new Game();
    const moves: string[] = [];
    while (moves.length < plies) {
      const legal = g.legalMoves();
      if (legal.length === 0 || g.boardOutcome()) break;
      const m = legal[Math.floor(rnd() * legal.length)]!;
      const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
      g.move(uci);
      moves.push(uci);
    }
    if (moves.length === plies) return moves;
    x += 1;
  }
}

/**
 * Fake engine: for each position, says the game's own move was best (an
 * "engine user") or that some other move was best and the played one lost
 * `humanLossCp` (a "human").
 */
function fakeAnalyzer(moves: string[], mode: (ply: number) => 'engine' | 'human', humanLossCp = 60): Analyzer {
  const byFen = new Map<string, { ply: number }>();
  const g = new Game();
  moves.forEach((m, i) => {
    byFen.set(g.fen, { ply: i });
    g.move(m);
  });
  return {
    async analyze(fen) {
      const entry = byFen.get(fen);
      if (!entry) return { bestMove: null, score: { cp: 0 } };
      const played = moves[entry.ply]!;
      const whiteToMove = fen.split(' ')[1] === 'w';
      // Score alternates so that a "human" move drops the mover's eval by humanLossCp.
      const prevHuman = entry.ply > 0 && mode(entry.ply - 1) === 'human';
      const cp: Score = { cp: prevHuman ? (whiteToMove ? humanLossCp : -humanLossCp) : 0 };
      if (mode(entry.ply) === 'engine') return { bestMove: played, score: cp };
      return { bestMove: played === 'a1a1' ? 'h1h1' : 'zzzz', score: cp };
    },
  };
}

const finished = (moves: string[], over: Partial<FinishedGame> = {}): FinishedGame => ({
  gameId: over.gameId ?? 'g1',
  initialFen: new Game().fen,
  moves,
  thinkMs: moves.map(() => 2000),
  white: { id: 'w1', rating: 1200 },
  black: { id: 'b1', rating: 1200 },
  endedAt: 1000,
  rated: true,
  timeControl: { initialMs: 300_000, incrementMs: 0 },
  ...over,
});

describe('message validation', () => {
  it('accepts well-formed messages', () => {
    expect(validateClientMessage({ t: 'move', gameId: 'abc123', uci: 'e7e8q', ply: 10 })).toBeNull();
    expect(validateClientMessage({ t: 'seek', timeControl: { initialMs: 1, incrementMs: 0 }, rated: true, ratingRange: [1000, 1400] })).toBeNull();
  });
  it('rejects malformed moves and fields', () => {
    expect(validateClientMessage({ t: 'move', gameId: 'abc', uci: 'e2e9', ply: 0 })).toMatch(/move/);
    expect(validateClientMessage({ t: 'move', gameId: 'abc', uci: 'e2e4', ply: -1 })).toMatch(/ply/);
    expect(validateClientMessage({ t: 'move', gameId: 'abc', uci: 'e2e4', ply: 1.5 })).toMatch(/ply/);
    expect(validateClientMessage({ t: 'move', gameId: '../../x', uci: 'e2e4', ply: 0 })).toMatch(/game/);
    expect(validateClientMessage({ t: 'move', gameId: 'a', uci: { toString: () => 'e2e4' }, ply: 0 } as never)).toMatch(/move/);
    expect(validateClientMessage({ t: 'seek', timeControl: { initialMs: 1, incrementMs: 0 }, rated: true, ratingRange: [1400, 1000] })).toBeTruthy();
    expect(validateClientMessage({ t: 'hello', v: 1, token: 'x'.repeat(5000) })).toBeTruthy();
    expect(validateClientMessage({ t: 'nope' } as never)).toBeTruthy();
  });
});

describe('rate limiting', () => {
  it('token bucket refills over time', () => {
    const b = new TokenBucket({ burst: 2, perSecond: 1 }, 0);
    expect([b.take(0), b.take(0), b.take(0)]).toEqual([true, true, false]);
    expect(b.take(1000)).toBe(true);
  });
  it('limits moves separately and disconnects persistent abusers', () => {
    const l = new ConnectionLimiter({ ...DEFAULT_RATE_LIMITS, moves: { burst: 2, perSecond: 1 }, maxViolations: 3 }, 0);
    expect(l.check('moves', 0)).toBe('ok');
    expect(l.check('moves', 0)).toBe('ok');
    expect(l.check('moves', 0)).toBe('limited');
    expect(l.check(null, 0)).toBe('ok');
    expect(l.check('moves', 0)).toBe('limited');
    expect(l.check('moves', 0)).toBe('disconnect');
  });
  it('limits connections per IP', () => {
    const ip = new IpLimiter({ burst: 2, perSecond: 0.1 });
    expect([ip.allow('1.2.3.4', 0), ip.allow('1.2.3.4', 0), ip.allow('1.2.3.4', 0), ip.allow('5.6.7.8', 0)]).toEqual([true, true, false, true]);
  });
});

describe('engine correlation analysis', () => {
  const moves = randomGame(80);

  it('scores an engine-matching side far above expectation', async () => {
    const game = finished(moves);
    const evals = await evaluateGame(game, fakeAnalyzer(moves, () => 'engine'));
    const reports = reportsFromEvals(game, evals);
    expect(reports).toHaveLength(2);
    for (const r of reports) {
      expect(r.matchRate).toBe(1);
      expect(r.accuracy).toBe(100);
      expect(r.accuracyZ).toBeGreaterThan(4);
    }
  });

  it('scores a human-like side near expectation', async () => {
    const game = finished(moves);
    const human = (ply: number) => (ply % 6 === 0 || ply % 6 === 1 ? 'engine' : 'human');
    const reports = reportsFromEvals(game, await evaluateGame(game, fakeAnalyzer(moves, human)));
    for (const r of reports) {
      expect(r.matchRate).toBeLessThan(0.5);
      expect(r.accuracyZ).toBeLessThan(2);
    }
  });

  it('only one side cheating flags only that side', async () => {
    const game = finished(moves);
    const whiteCheats = (ply: number) => (ply % 2 === 0 ? 'engine' : 'human');
    const reports = reportsFromEvals(game, await evaluateGame(game, fakeAnalyzer(moves, whiteCheats)));
    const w = reports.find((r) => r.color === 'w')!;
    const b = reports.find((r) => r.color === 'b')!;
    expect(w.matchRate).toBe(1);
    expect(b.matchRate).toBe(0);
  });

  const report = (over: Partial<SideReport>): SideReport => ({
    gameId: 'g',
    playerId: 'p',
    color: 'w',
    rating: 1200,
    moves: 25,
    accuracy: 65,
    expectedAccuracy: 65,
    accuracyZ: 0,
    topMatches: 8,
    matchRate: 0.32,
    expectedMatchRate: 0.32,
    acpl: 60,
    meanThinkMs: 4000,
    thinkCv: 0.9,
    analyzedAt: 0,
    ...over,
  });

  it('pools several moderately strong games into a flag', () => {
    const strong = Array.from({ length: 4 }, (_, i) => report({ gameId: `g${i}`, accuracy: 90, topMatches: 18, matchRate: 0.72 }));
    const a = assessPlayer('p', strong);
    expect(a.reasons).toContain('engine_correlation');
    expect(a.score).toBeGreaterThanOrEqual(50);
  });

  it('does not flag normal play, or one lucky game on its own', () => {
    expect(assessPlayer('p', Array.from({ length: 10 }, () => report({}))).score).toBeLessThan(20);
    const lucky = assessPlayer('p', [report({ accuracy: 92, topMatches: 15, matchRate: 0.6 })]);
    expect(lucky.reasons).toEqual([]);
    expect(lucky.score).toBeLessThan(50);
  });

  it('flags mechanical move timing only alongside elevated accuracy', () => {
    const robotic = Array.from({ length: 4 }, () => report({ thinkCv: 0.1 }));
    expect(assessPlayer('p', robotic).reasons).not.toContain('move_time_pattern');
    const roboticStrong = Array.from({ length: 4 }, () => report({ thinkCv: 0.1, accuracy: 85, topMatches: 12 }));
    expect(assessPlayer('p', roboticStrong).reasons).toContain('move_time_pattern');
  });
});

describe('review queue, bans and refunds', () => {
  function setup() {
    const players = new MemoryPlayerStore();
    const r = (rating: number) => ({ blitz: { rating, rd: 60, volatility: 0.06 } });
    players.save({ id: 'cheat', name: 'Cheat', ratings: r(1800) });
    players.save({ id: 'v1', name: 'Victim1', ratings: r(1500) });
    players.save({ id: 'v2', name: 'Victim2', ratings: r(1600) });
    let now = 1_000_000;
    const moves = randomGame(80, 3);
    const fp = new FairPlayService(players, {
      analyzer: fakeAnalyzer(moves, (ply) => (ply % 2 === 0 ? 'engine' : 'human')),
      now: () => now,
      log: () => {},
    });
    const tc = { initialMs: 180_000, incrementMs: 2000 };
    return { players, fp, moves, tc, tick: (ms: number) => (now += ms) };
  }

  it('analyses finished games in the background and opens a case', async () => {
    const { fp, moves, tc } = setup();
    for (let i = 0; i < 4; i++) {
      fp.gameFinished(finished(moves, { gameId: `g${i}`, white: { id: 'cheat', rating: 1500 }, black: { id: `v${(i % 2) + 1}`, rating: 1500 }, timeControl: tc }));
    }
    await fp.jobs.idle();
    const queue = fp.queue();
    expect(queue.map((c) => c.playerId)).toEqual(['cheat']);
    expect(queue[0]!.reasons).toContain('engine_correlation');
  });

  it('skips casual and short games', async () => {
    const { fp, moves } = setup();
    fp.gameFinished(finished(moves, { rated: false }));
    fp.gameFinished(finished(moves.slice(0, 20)));
    expect(fp.jobs.size).toBe(0);
  });

  it('ban refunds opponents only for games they lost to the cheater, once', () => {
    const { fp, players, tc } = setup();
    const game = (id: string, opp: string, w: number, b: number) =>
      fp.gameFinished({ ...finished([], { gameId: id, white: { id: 'cheat', rating: 1800 }, black: { id: opp, rating: 1500 }, timeControl: tc }), ratingDelta: { w, b } });
    game('a', 'v1', 6, -8);
    game('b', 'v1', -5, 7); // v1 won this one: nothing to refund
    game('c', 'v2', 4, -6.4);
    let kicked = '';
    fp.onBan = (id) => (kicked = id);
    const ban = fp.ban('cheat', 'mod', 'engine use')!;
    expect(kicked).toBe('cheat');
    expect(ban.refunds.map((r) => [r.playerId, r.points])).toEqual([
      ['v1', 8],
      ['v2', 6.4],
    ]);
    expect(players.get('v1')!.ratings.blitz!.rating).toBe(1508);
    expect(players.get('v2')!.ratings.blitz!.rating).toBeCloseTo(1606.4);
    expect(fp.isBanned('cheat')).toBe(true);
    expect(fp.ban('cheat', 'mod', 'again')).toBeNull();
    // Unban and re-ban must not refund twice.
    expect(fp.unban('cheat', 'mod', 'appeal')).toBe(true);
    expect(fp.ban('cheat', 'mod', 'again')!.refunds).toEqual([]);
  });

  it('does not refund games outside the window', () => {
    const { fp, players, tc, tick } = setup();
    fp.gameFinished({ ...finished([], { gameId: 'old', white: { id: 'cheat', rating: 1800 }, black: { id: 'v1', rating: 1500 }, timeControl: tc, endedAt: 0 }), ratingDelta: { w: 5, b: -5 } });
    tick(100 * 24 * 3600_000);
    expect(fp.ban('cheat', 'mod', 'x')!.refunds).toEqual([]);
    expect(players.get('v1')!.ratings.blitz!.rating).toBe(1500);
  });

  it('dismissed cases stay closed unless evidence clearly grows', () => {
    const { fp } = setup();
    fp.report('v1', 'player:v2', 'too accurate');
    expect(fp.queue().map((c) => c.playerId)).toEqual(['v1']);
    expect(fp.dismiss('v1', 'mod')).not.toBeNull();
    expect(fp.queue()).toEqual([]);
    expect(fp.reassess('v1')!.status).toBe('dismissed');
    expect(fp.caseFile('v1').audit.map((a) => a.action)).toEqual(['manual_report', 'dismissed']);
  });
});

const sf = process.env.STOCKFISH_PATH;
describe.skipIf(!sf)('real Stockfish', () => {
  it('evaluates positions from White\'s point of view', async () => {
    const e = new UciEngine({ path: sf!, depth: 10 });
    try {
      // Black to move, White up a queen.
      const r = await e.analyze('4k3/8/8/8/8/8/8/3QK3 b - - 0 1');
      expect(r.score.cp ?? 10_000).toBeGreaterThan(500);
      const mate = await e.analyze('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
      expect(mate.bestMove).toBe('a1a8');
      expect(mate.score.mate).toBe(1);
    } finally {
      await e.close();
    }
  }, 20_000);
});
