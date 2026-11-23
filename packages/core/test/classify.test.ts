import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { Game, START_FEN, bookTimeline, buildReview, classifyMove, findSacrifice, isBookPosition, openingTimeline, staticExchange, type PositionEval } from '../src';

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

describe('sacrifice detection is strict', () => {
  it('does not count a piece that was already en prise before the move', () => {
    // The knight on f5 was already attacked by the g6 pawn; moving the queen does not offer it.
    expect(findSacrifice('6k1/5p2/6p1/5N2/8/8/3Q4/6K1 w - - 0 1', 'd2d4')).toBeNull();
  });

  it('does not count a desperado capture by a piece that was hanging anyway', () => {
    // The knight on e5 is attacked by the d6 pawn; Nxc6 grabs a pawn and is taken by b7.
    expect(findSacrifice('6k1/1p6/2pp4/4N3/8/8/8/6K1 w - - 0 1', 'e5c6')).toBeNull();
  });

  it('does not count an offer that is won straight back', () => {
    // Nf5 uncovers the rook on the queen: gxf5 Rxd7 wins far more than the knight.
    const fen = '6k1/3q1p2/6p1/8/3N4/8/8/3RK3 w - - 0 1';
    expect(findSacrifice(fen, 'd4f5')).toBeNull();
    const j = classifyMove({ fenBefore: fen, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 0 }, playedScore: { cp: 0 } });
    expect(j.classification).not.toBe('brilliant');
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

  it('gives !! (not !!!) when the queen moves away from a piece it was guarding', () => {
    // The queen on d3 guards the knight on f5 against the rook; Qd4 leaves it to be taken.
    const fen = '5rk1/8/8/5N2/8/3Q4/8/6K1 w - - 0 1';
    expect(findSacrifice(fen, 'd3d4')).toMatchObject({ square: 'f5', piece: 'n', amount: 3 });
    const j = classifyMove({ fenBefore: fen, uci: 'd3d4', bestMove: 'd3d4', bestScore: { cp: 60 }, playedScore: { cp: 60 } });
    expect(j.classification).toBe('brilliant');
  });

  it('does not reward an unsound sacrifice', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4e2', bestScore: { cp: 40 }, playedScore: { cp: -280 } });
    expect(['mistake', 'blunder']).toContain(j.classification);
  });

  it('does not give !! to a sacrifice that is only near the best move', () => {
    // Loses 0.015 expected points: excellent, not brilliant.
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4e2', bestScore: { cp: 40 }, playedScore: { cp: 25 } });
    expect(j.classification).toBe('excellent');
  });

  it('does not reward a sacrifice when the position was already completely winning', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 600 }, playedScore: { cp: 600 } });
    expect(j.classification).toBe('best');
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

  it('follows the expected-points loss bands', () => {
    const base = { fenBefore: KNIGHT_OFFER, uci: 'd4e2', bestMove: 'd4f5', bestScore: { cp: 0 } };
    const at = (cp: number) => classifyMove({ ...base, playedScore: { cp } }).classification;
    expect(at(-10)).toBe('excellent'); // 0.01
    expect(at(-40)).toBe('good'); // 0.04
    expect(at(-70)).toBe('inaccuracy'); // 0.07
    expect(at(-150)).toBe('mistake'); // 0.15
    expect(at(-250)).toBe('blunder'); // 0.23
    // Missing a mate but staying clearly winning is not a blunder.
    expect(classifyMove({ ...base, bestScore: { mate: 3 }, playedScore: { cp: 800 } }).classification).toBe('good');
    // Walking into a mate from an equal position is.
    expect(classifyMove({ ...base, playedScore: { mate: -2 } }).classification).toBe('blunder');
  });
});

describe('review badges', () => {
  it('marks opening moves as book', () => {
    const ev = (cp: number, best: string): PositionEval => ({ score: { cp }, bestMove: best, pv: [best], depth: 12 });
    const review = buildReview('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5'], [ev(30, 'e2e4'), ev(30, 'e7e5'), ev(30, 'g1f3')]);
    expect(review.moves.map((m) => m.judgement.classification)).toEqual(['book', 'book']);
  });
});

describe('opening theory', () => {
  // Ruy Lopez, Closed: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3
  const RUY = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3'];

  it('keeps a main line in theory even where the position has no name of its own', () => {
    // 4. Ba4 is not a named position, which used to end the book there.
    expect(openingTimeline(RUY)[7]?.ply).not.toBe(7);
    expect(bookTimeline(RUY)).toEqual(RUY.map(() => true));
  });

  it('leaves theory at the first unknown move and never comes back', () => {
    // 1. Nf3 Nf6 2. Ng1 Ng8 3. e4 reaches the position after 1. e4, but by an unknown route.
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'e2e4'];
    expect(isBookPosition(Game.fromUciMoves(moves, START_FEN).fen)).toBe(true);
    const t = bookTimeline(moves);
    expect(t.slice(0, 2)).toEqual([true, true]);
    expect(t.slice(2)).toEqual([false, false, false]);
  });

  it('has no theory from a custom start position', () => {
    expect(bookTimeline(['e2e4'], '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')).toEqual([false]);
  });

  it('judges a theory move the engine calls a mistake, and ends theory there', () => {
    const ev = (cp: number, best: string): PositionEval => ({ score: { cp }, bestMove: best, pv: [best], depth: 12 });
    // 1. e4 e5 2. Nf3 Nc6: pretend the engine thinks 2. Nf3 loses a lot.
    const review = buildReview(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], [ev(30, 'e2e4'), ev(30, 'e7e5'), ev(30, 'd2d4'), ev(-150, 'b8c6'), ev(-150, 'f1c4')]);
    expect(review.moves.map((m) => m.judgement.classification)).toEqual(['book', 'book', 'mistake', 'best']);
  });
});
