import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildReview, classifyMove, findSacrifice, staticExchange, type PositionEval } from '../src';

// Smothered mate: 1. Qg8+! Rxg8 2. Nf7#. The queen is offered on g8.
const SMOTHER = '5r1k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1';
// A knight offered to the g6 pawn on f5.
const KNIGHT_OFFER = '6k1/5p2/6p1/8/3N4/8/8/6K1 w - - 0 1';

describe('sacrifice detection', () => {
  it('counts the exchange on a square', () => {
    const c = new Chess('6k1/5p2/6p1/5N2/8/8/8/6K1 b - - 0 1');
    expect(staticExchange(c, 'f5')).toBe(3);
  });

  it('sees a piece offered to a pawn', () => {
    expect(findSacrifice(KNIGHT_OFFER, 'd4f5')).toMatchObject({ square: 'f5', piece: 'n', amount: 3 });
    expect(findSacrifice(KNIGHT_OFFER, 'd4e2')).toBeNull();
  });

  it('sees the queen offered', () => {
    expect(findSacrifice(SMOTHER, 'd5g8')).toMatchObject({ square: 'g8', piece: 'q' });
  });

  it('does not count an even trade or a mating move', () => {
    // Bishop takes a defended knight: bishop for knight is even.
    expect(findSacrifice('6k1/8/4p3/3n4/8/1B6/8/6K1 w - - 0 1', 'b3d5')).toBeNull();
    // Delivering mate offers nothing.
    expect(findSacrifice('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8')).toBeNull();
  });
});

describe('classifyMove', () => {
  it('gives !!! to a queen sacrifice that forces mate', () => {
    const j = classifyMove({ fenBefore: SMOTHER, uci: 'd5g8', bestMove: 'd5g8', bestScore: { mate: 2 }, playedScore: { mate: 2 } });
    expect(j.classification).toBe('masterpiece');
  });

  it('gives !! (not !!!) to a sound queen sacrifice that does not force mate', () => {
    const j = classifyMove({ fenBefore: SMOTHER, uci: 'd5g8', bestMove: 'd5g8', bestScore: { cp: 300 }, playedScore: { cp: 300 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! to a sound sacrifice by another piece', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 40 }, playedScore: { cp: 35 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! (not !!!) when the queen moves but another piece is offered', () => {
    // Queen steps away and leaves the knight on f5 to the g6 pawn.
    const fen = '6k1/5p2/6p1/5N2/8/8/3Q4/6K1 w - - 0 1';
    const offered = findSacrifice(fen, 'd2d4');
    expect(offered).toMatchObject({ piece: 'n' });
    const j = classifyMove({ fenBefore: fen, uci: 'd2d4', bestMove: 'd2d4', bestScore: { cp: 60 }, playedScore: { cp: 60 } });
    expect(j.classification).toBe('brilliant');
  });

  it('does not reward an unsound sacrifice', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4e2', bestScore: { cp: 40 }, playedScore: { cp: -280 } });
    expect(['mistake', 'blunder']).toContain(j.classification);
  });

  it('does not reward a sacrifice when already winning easily', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 900 }, playedScore: { cp: 900 } });
    expect(j.classification).toBe('best');
  });

  it('gives ! to the only good move', () => {
    const j = classifyMove({
      fenBefore: KNIGHT_OFFER,
      uci: 'd4e2',
      bestMove: 'd4e2',
      bestScore: { cp: 0 },
      secondBestScore: { cp: -300 },
      playedScore: { cp: 0 },
    });
    expect(j.classification).toBe('great');
  });

  it('does not give ! to a plain recapture', () => {
    // Black just took on d5; White recaptures with the bishop.
    const fen = '6k1/8/8/3n4/8/1B6/8/6K1 w - - 0 1';
    const j = classifyMove({
      fenBefore: fen,
      uci: 'b3d5',
      bestMove: 'b3d5',
      bestScore: { cp: 0 },
      secondBestScore: { cp: -300 },
      playedScore: { cp: 0 },
      previousUci: 'e7d5',
    });
    expect(j.classification).toBe('best');
  });

  it('marks a missed chance after the opponent erred', () => {
    const j = classifyMove({
      fenBefore: KNIGHT_OFFER,
      uci: 'd4e2',
      bestMove: 'd4f5',
      bestScore: { cp: 500 },
      playedScore: { cp: 100 },
      previousLoss: 0.3,
    });
    expect(j.classification).toBe('miss');
  });

  it('keeps the usual scale otherwise', () => {
    const base = { fenBefore: KNIGHT_OFFER, uci: 'd4e2', bestMove: 'd4f5', bestScore: { cp: 0 } };
    expect(classifyMove({ ...base, playedScore: { cp: -5 } }).classification).toBe('best');
    expect(classifyMove({ ...base, playedScore: { cp: -40 } }).classification).toBe('good');
    expect(classifyMove({ ...base, playedScore: { cp: -120 } }).classification).toBe('mistake');
    expect(classifyMove({ ...base, playedScore: { cp: -600 } }).classification).toBe('blunder');
  });
});

describe('review badges', () => {
  it('marks opening moves as book', () => {
    const ev = (cp: number, best: string): PositionEval => ({ score: { cp }, bestMove: best, pv: [best], depth: 12 });
    const review = buildReview('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5'], [ev(30, 'e2e4'), ev(30, 'e7e5'), ev(30, 'g1f3')]);
    expect(review.moves.map((m) => m.judgement.classification)).toEqual(['book', 'book']);
  });
});
