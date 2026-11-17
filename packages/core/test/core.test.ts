import { describe, expect, it } from 'vitest';
import {
  Game,
  analyzePosition,
  createClock,
  expectedScore,
  formatClock,
  gameAccuracy,
  judgeMove,
  sacrificedMaterial,
  START_FEN,
  parseInfoLine,
  parseTimeControl,
  pressClock,
  quickFeedback,
  remaining,
  startClock,
  timeCategory,
  updateRating,
  DEFAULT_RATING,
} from '../src';

describe('Game', () => {
  it('plays UCI moves and detects checkmate', () => {
    const g = Game.fromUciMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(g.boardOutcome()).toEqual({ result: '0-1', reason: 'checkmate', winner: 'b' });
  });

  it('rejects illegal moves without throwing', () => {
    const g = new Game();
    expect(g.move('e2e5')).toBeNull();
    expect(g.isLegal('e2e4')).toBe(true);
    expect(g.move('e2e4')?.san).toBe('e4');
  });

  it('handles promotion and stalemate', () => {
    const g = new Game('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
    expect(g.move('f7f8')).not.toBeNull();
    const s = new Game('7k/8/6QK/8/8/8/8/8 w - - 0 1');
    s.move('g6f7');
    expect(s.boardOutcome()?.reason).toBe('stalemate');
    const p = new Game('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(p.move('a7a8n')?.promotion).toBe('n');
  });

  it('knows mating material', () => {
    const g = new Game('8/8/8/8/8/2k5/8/K1N5 w - - 0 1');
    expect(g.hasMatingMaterial('w')).toBe(false);
    expect(g.hasMatingMaterial('b')).toBe(false);
    expect(new Game().hasMatingMaterial('w')).toBe(true);
  });

  it('exports PGN', () => {
    const g = Game.fromUciMoves(['e2e4', 'e7e5']);
    expect(g.pgn({ Event: 'Test' })).toContain('1. e4 e5');
  });
});

describe('clock', () => {
  it('counts down, adds increment and flags', () => {
    let c = startClock(createClock(parseTimeControl('1+2')), 'w', 0);
    expect(remaining(c, 'w', 10_000)).toBe(50_000);
    const r = pressClock(c, 'w', 10_000);
    expect(r.flagged).toBe(false);
    c = r.clock;
    expect(c.remainingMs.w).toBe(52_000);
    expect(c.running).toBe('b');
    expect(pressClock(c, 'b', 10_000 + 61_000).flagged).toBe(true);
  });

  it('formats', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(5_400)).toBe('0:05.4');
    expect(formatClock(3_600_000)).toBe('1:00:00');
  });

  it('categorises time controls', () => {
    expect(timeCategory(parseTimeControl('1+0'))).toBe('bullet');
    expect(timeCategory(parseTimeControl('3+2'))).toBe('blitz');
    expect(timeCategory(parseTimeControl('10+0'))).toBe('rapid');
    expect(timeCategory(parseTimeControl('30+20'))).toBe('classical');
  });
});

describe('threats', () => {
  it('finds an undefended piece', () => {
    // Black knight on e5 attacked by white pawn d4, undefended.
    const ins = analyzePosition('4k3/8/8/4n3/3P4/8/8/4K3 b - - 0 1', 'b');
    expect(ins.hanging[0]).toMatchObject({ square: 'e5', piece: 'n' });
    expect(ins.threats.some((t) => t.uci === 'd4e5')).toBe(true);
  });

  it('spots a mate threat for the opponent', () => {
    // White threatens Qxf7# (scholar's pattern); it is Black to move.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const ins = analyzePosition(fen, 'b');
    expect(ins.threats[0]?.kind).toBe('mate');
    expect(ins.threats[0]?.san).toBe('Qxf7#');
  });

  it('spots a knight fork opportunity', () => {
    const ins = analyzePosition('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'w');
    const fork = ins.opportunities.find((o) => o.san === 'Nc7+');
    expect(fork?.kind).toBe('fork');
    expect(fork?.description).toMatch(/forking/);
  });
});

describe('evaluation', () => {
  it('maps scores to expected score', () => {
    expect(expectedScore({ cp: 0 })).toBeCloseTo(0.5);
    expect(expectedScore({ mate: 3 })).toBe(1);
    expect(expectedScore({ cp: 300 })).toBeGreaterThan(0.7);
  });

  it('classifies moves', () => {
    const blunder = judgeMove({ mover: 'w', bestScore: { cp: 50 }, playedScore: { cp: -400 }, playedIsBest: false });
    expect(blunder.classification).toBe('blunder');
    const best = judgeMove({ mover: 'b', bestScore: { cp: -30 }, playedScore: { cp: -30 }, playedIsBest: true });
    expect(best.classification).toBe('best');
    const inacc = judgeMove({ mover: 'w', bestScore: { cp: 30 }, playedScore: { cp: -30 }, playedIsBest: false });
    expect(['inaccuracy', 'good']).toContain(inacc.classification);
    expect(gameAccuracy([100, 100, 20])).toBeLessThan(80);
  });

  it('marks sound sacrifices as brilliant or masterpiece, and unpunished errors as missed chances', () => {
    const sac = { mover: 'w' as const, bestScore: { cp: 150 }, playedScore: { cp: 150 }, playedIsBest: true };
    expect(judgeMove({ ...sac, sacrifice: 3 }).classification).toBe('brilliant');
    expect(judgeMove({ ...sac, bestScore: { mate: 4 }, playedScore: { mate: 4 }, sacrifice: 9 }).classification).toBe('masterpiece');
    expect(judgeMove({ ...sac, sacrifice: 1 }).classification).toBe('best');
    // A losing "sacrifice" is not brilliant, even when it is the engine's choice.
    expect(judgeMove({ ...sac, bestScore: { cp: -300 }, playedScore: { cp: -300 }, sacrifice: 3 }).classification).toBe('best');
    const missed = judgeMove({ mover: 'w', bestScore: { cp: 400 }, playedScore: { cp: 250 }, playedIsBest: false, opponentErred: true });
    expect(missed.classification).toBe('missed');
    expect(judgeMove({ mover: 'w', bestScore: { cp: 400 }, playedScore: { cp: 250 }, playedIsBest: false }).classification).not.toBe('missed');
  });

  it('measures material left en prise by a move', () => {
    // White queen on h5 attacked by the g6 pawn, nothing captured.
    expect(sacrificedMaterial('rnbqkbnr/pppppp1p/6p1/7Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 3', 'w')).toBeGreaterThanOrEqual(8);
    expect(sacrificedMaterial(START_FEN, 'w')).toBe(0);
  });

  it('parses UCI info lines', () => {
    const i = parseInfoLine('info depth 20 seldepth 28 multipv 1 score cp -35 upperbound nodes 1000 nps 500 time 2 pv e7e5 g1f3');
    expect(i).toMatchObject({ depth: 20, multipv: 1, score: { cp: -35 }, bound: 'upper', pv: ['e7e5', 'g1f3'] });
    expect(parseInfoLine('info depth 5 score mate -2 pv a1a2')?.score).toEqual({ mate: -2 });
  });
});

describe('rating', () => {
  it('matches the Glicko-2 paper example', () => {
    const r = updateRating({ rating: 1500, rd: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
    ]);
    expect(r.rating).toBeCloseTo(1464.06, 1);
    expect(r.rd).toBeCloseTo(151.52, 1);
    expect(r.volatility).toBeCloseTo(0.05999, 4);
  });

  it('winner gains, loser drops', () => {
    const w = updateRating(DEFAULT_RATING, [{ opponent: DEFAULT_RATING, score: 1 }]);
    expect(w.rating).toBeGreaterThan(1500);
  });
});

describe('coach', () => {
  it('produces quick feedback for a blunder', () => {
    const insight = analyzePosition('4k3/8/8/4n3/3P4/8/8/4K3 b - - 0 1', 'b');
    const text = quickFeedback({
      movePlayed: 'Kd7',
      bestMove: 'Nc6',
      judgement: { classification: 'blunder', loss: 0.3, accuracy: 20 },
      insightAfter: insight,
    });
    expect(text).toMatch(/blunder/);
    expect(text).toMatch(/Nc6/);
  });
});
