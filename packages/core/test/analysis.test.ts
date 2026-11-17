import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  buildReview,
  coachContextFor,
  importPosition,
  lineFromInfo,
  positionEvalFrom,
  positionKey,
  pvToSan,
  terminalState,
  type PositionEval,
} from '../src';

const ev = (cp: number, bestMove: string, pv: string[] = [bestMove]): PositionEval => ({ score: { cp }, bestMove, pv, depth: 12 });

describe('engine lines', () => {
  it('converts side-to-move scores to White view and PVs to SAN', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const line = lineFromInfo(fen, { depth: 10, multipv: 2, score: { cp: 30 }, pv: ['e7e5', 'g1f3'] })!;
    expect(line.score).toEqual({ cp: -30 });
    expect(line.san).toEqual(['e5', 'Nf3']);
    expect(line.multipv).toBe(2);
  });

  it('ignores bound-only scores and stops SAN at illegal moves', () => {
    expect(lineFromInfo(START_FEN, { score: { cp: 1 }, bound: 'lower', pv: ['e2e4'] })).toBeNull();
    expect(pvToSan(START_FEN, ['e2e4', 'e2e4'])).toEqual(['e4']);
  });

  it('recognises finished positions', () => {
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(terminalState(mated)).toBe('checkmate');
    expect(positionEvalFrom(mated, null).score).toEqual({ cp: -100_000 });
    expect(terminalState(START_FEN)).toBeUndefined();
    expect(positionKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });
});

describe('importPosition', () => {
  it('reads PGN with headers', () => {
    const g = importPosition('[Event "Casual"]\n[White "A"]\n\n1. e4 e5 2. Nf3 Nc6 *')!;
    expect(g.moves).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(g.headers.White).toBe('A');
    expect(g.initialFen).toBe(START_FEN);
  });

  it('reads a bare move list and a FEN', () => {
    expect(importPosition('1. d4 d5 2. c4')!.moves).toEqual(['d2d4', 'd7d5', 'c2c4']);
    const fen = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1';
    expect(importPosition(fen)).toEqual({ initialFen: fen, moves: [], headers: {} });
  });

  it('rejects junk', () => {
    expect(importPosition('hello world')).toBeNull();
    expect(importPosition('')).toBeNull();
  });
});

describe('buildReview', () => {
  // 1. f3 e5 2. g4?? Qh4#
  const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const g = (fen: string) => fen;
  const evals: PositionEval[] = [
    ev(30, 'e2e4'),
    ev(-40, 'e7e5'), // f3 lost a little
    ev(-50, 'd2d4'),
    { score: { mate: -1 }, bestMove: 'd8h4', pv: ['d8h4'], depth: 12 }, // after g4: black mates in 1
    positionEvalFrom(g('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), null),
  ];
  const review = buildReview(START_FEN, moves, evals);

  it('classifies each move', () => {
    expect(review.moves.map((m) => m.judgement.classification)).toEqual(['inaccuracy', 'best', 'blunder', 'best']);
    expect(review.moves[2]!.bestSan).toBe('d4');
    expect(review.moves[2]!.feedback).toMatch(/blunder/);
    expect(review.moves[3]!.san).toBe('Qh4#');
  });

  it('summarises accuracy and counts per side', () => {
    expect(review.counts.w.blunder).toBe(1);
    expect(review.counts.b.best).toBe(2);
    expect(review.accuracy.b).toBe(100);
    expect(review.accuracy.w).toBeLessThan(60);
  });

  it('produces coach context for a move', () => {
    const ctx = coachContextFor(review, 3)!;
    expect(ctx.movePlayed).toBe('g4');
    expect(ctx.bestMove).toBe('d4');
    expect(ctx.judgement.classification).toBe('blunder');
    expect(coachContextFor(review, 99)).toBeNull();
  });

  it('requires one evaluation per position', () => {
    expect(() => buildReview(START_FEN, moves, evals.slice(1))).toThrow();
  });
});
