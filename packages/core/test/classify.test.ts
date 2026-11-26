import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { Game, START_FEN, bookTimeline, buildReview, classifyMove, findSacrifice, isBookPosition, openingTimeline, staticExchange, type PositionEval } from '../src';

// Smothered mate: 1. Qg8+! Rxg8 2. Nf7#. The queen is offered on g8.
const SMOTHER = '5r1k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1';
// A knight offered to the g6 pawn on f5.
const KNIGHT_OFFER = '6k1/5p2/6p1/8/3N4/8/8/6K1 w - - 0 1';
// 1. Rxh7+! Kxh7 2. Qh5#. The rook is given for a pawn; the bishop on c4 covers g8.
const ROOK_SAC = 'r6k/6pp/8/8/2B5/7R/5PPP/3Q2K1 w - - 0 1';

describe('sacrifice detection', () => {
  it('counts the exchange on a square', () => {
    const c = new Chess('6k1/5p2/6p1/5N2/8/8/8/6K1 b - - 0 1');
    expect(staticExchange(c, 'f5')).toBe(3);
  });

  it('leaves pinned pieces out of the exchange', () => {
    // The e6 pawn could take the knight, but it is pinned to its king by the rook.
    expect(staticExchange(new Chess('4k3/8/4p3/5N2/8/8/8/4R1K1 b - - 0 1'), 'f5')).toBe(0);
    expect(staticExchange(new Chess('4k3/8/4p3/5N2/8/8/8/R5K1 b - - 0 1'), 'f5')).toBe(3);
  });

  it('counts a capture that promotes as the piece taken plus the promotion', () => {
    // gxh8=Q wins the rook and turns a pawn into a queen.
    expect(staticExchange(new Chess('k6r/6P1/8/8/8/8/8/6K1 w - - 0 1'), 'h8')).toBe(5 + 9 - 1);
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
  it('counts leaving an attacked piece that could have been saved', () => {
    // The knight on f5 is attacked by the g6 pawn and could retreat; Qd4 leaves it there.
    expect(findSacrifice('6k1/5p2/6p1/5N2/8/8/3Q4/6K1 w - - 0 1', 'd2d4')).toMatchObject({ square: 'f5', piece: 'n', amount: 3 });
    // Fischer's 17...Be6!! (Byrne v Fischer 1956): Bc5 already attacked the queen, and Black lets it go.
    expect(findSacrifice('r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 3 17', 'g4e6')).not.toBeNull();
  });

  it('counts a promotion that is taken at once as only the pawn given up', () => {
    // h8=Q+ Kxh8: the new queen is lost, but all White really gave was the pawn.
    expect(findSacrifice('6k1/7P/8/8/8/8/8/6K1 w - - 0 1', 'h7h8q')).toBeNull();
  });

  it('marks a desperado capture by a piece that was lost anyway', () => {
    // The knight on a8 is trapped (b6 and c7 are covered) and attacked by the rook; Nxb6 just takes a pawn for it.
    const fen = 'Nr4k1/p7/1p6/4b3/8/8/8/6K1 w - - 0 1';
    expect(findSacrifice(fen, 'a8b6')).toMatchObject({ piece: 'n', lostAnyway: true });
    const j = classifyMove({ fenBefore: fen, uci: 'a8b6', bestMove: 'a8b6', bestScore: { cp: 150 }, playedScore: { cp: 150 } });
    expect(j.classification).toBe('best');
  });

  it('marks an offer that is won straight back as a piece that cannot be taken', () => {
    // Nf5 uncovers the rook on the queen: gxf5 Rxd7 wins far more than the knight.
    expect(findSacrifice('6k1/3q1p2/6p1/8/3N4/8/8/3RK3 w - - 0 1', 'd4f5')).toMatchObject({ square: 'f5', piece: 'n', trap: true });
  });

  it('counts a rook given for a minor piece and a pawn (the exchange)', () => {
    // Rxd6 exd6 Bxd6: the rook goes for the knight and a pawn.
    expect(findSacrifice('6k1/4p3/3n4/8/5B2/8/8/3R2K1 w - - 0 1', 'd1d6')).toEqual({ square: 'd6', piece: 'r', amount: 2 });
    // Without the bishop it is the rook for the knight.
    expect(findSacrifice('6k1/4p3/3n4/8/8/8/8/3R2K1 w - - 0 1', 'd1d6')).toEqual({ square: 'd6', piece: 'r', amount: 2 });
    // A bishop for two pawns: Bxe6 fxe6 Qxe6+.
    expect(findSacrifice('6k1/5p2/4p3/8/2B5/8/4Q3/6K1 w - - 0 1', 'c4e6')).toEqual({ square: 'e6', piece: 'b', amount: 2 });
  });
});

describe('classifyMove', () => {
  it('gives !!! to a queen sacrifice that forces mate', () => {
    const j = classifyMove({ fenBefore: SMOTHER, uci: 'd5g8', bestMove: 'd5g8', bestScore: { mate: 2 }, playedScore: { mate: 1 } });
    expect(j.classification).toBe('masterpiece');
  });

  it('gives !!! to a rook sacrifice that forces mate', () => {
    expect(findSacrifice(ROOK_SAC, 'h3h7')).toMatchObject({ square: 'h7', piece: 'r', amount: 4 });
    const j = classifyMove({ fenBefore: ROOK_SAC, uci: 'h3h7', bestMove: 'h3h7', bestScore: { mate: 2 }, playedScore: { mate: 1 } });
    expect(j.classification).toBe('masterpiece');
  });

  it('gives !!! to a rook sacrifice by Black that forces mate', () => {
    const fen = '3q2k1/5ppp/7r/2b5/8/8/6PP/R6K b - - 0 1'; // ...Rxh2+ Kxh2 Qh4#
    const j = classifyMove({ fenBefore: fen, uci: 'h6h2', bestMove: 'h6h2', bestScore: { mate: -2 }, playedScore: { mate: -1 } });
    expect(j.classification).toBe('masterpiece');
  });

  it('gives !!! even when the search before the sacrifice had not seen the mate yet', () => {
    // Before the move the engine only saw "+7", which on its own counts as winning easily.
    const j = classifyMove({ fenBefore: ROOK_SAC, uci: 'h3h7', bestMove: 'h3h7', bestScore: { cp: 700 }, playedScore: { mate: 1 } });
    expect(j.classification).toBe('masterpiece');
  });

  it('gives !! (not !!!) to a sound rook sacrifice that does not force mate', () => {
    const j = classifyMove({ fenBefore: ROOK_SAC, uci: 'h3h7', bestMove: 'h3h7', bestScore: { cp: 300 }, playedScore: { cp: 300 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! (not !!!) to a minor-piece sacrifice that forces mate', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { mate: 5 }, playedScore: { mate: 5 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! to a minor-piece sacrifice that forces mate even from a won position', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 900 }, playedScore: { mate: 5 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives no sacrifice badge when a faster mate was already there', () => {
    // The engine saw mate in 2; the sacrifice still mates, but only in 6.
    const j = classifyMove({ fenBefore: ROOK_SAC, uci: 'h3h7', bestMove: 'd1h5', bestScore: { mate: 2 }, playedScore: { mate: 6 } });
    expect(j.classification).toBe('best');
  });

  it('gives !! (not !!!) to a sound queen sacrifice that does not force mate', () => {
    const j = classifyMove({ fenBefore: SMOTHER, uci: 'd5g8', bestMove: 'd5g8', bestScore: { cp: 300 }, playedScore: { cp: 300 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! to a sacrifice that gives the mover the advantage', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 150 }, playedScore: { cp: 140 } });
    expect(j.classification).toBe('brilliant');
  });

  it('does not give !! to a sacrifice that only keeps the balance', () => {
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 40 }, playedScore: { cp: 35 } });
    expect(j.classification).toBe('best');
  });

  it('gives !! to a sacrifice that wins the material back within a few moves', () => {
    // 1. Bxf7+ Kxf7 2. Ng5+ Kg6 3. Nxh7 Kxh7: the bishop comes back with the queen, though the engine calls it equal.
    const fen = '4k3/5p1q/8/8/2B5/5N2/8/6K1 w - - 0 1';
    const base = { fenBefore: fen, uci: 'c4f7', bestMove: 'c4f7', bestScore: { cp: 20 }, playedScore: { cp: 20 } } as const;
    expect(classifyMove({ ...base, playedLine: ['e8f7', 'f3g5', 'f7g6', 'g5h7', 'g6h7'] }).classification).toBe('brilliant');
    // Without the line, or when the line does not win it back, it is just the best move.
    expect(classifyMove(base).classification).toBe('best');
    expect(classifyMove({ ...base, playedLine: ['e8f7', 'f3g5', 'f7g6', 'g5f3'] }).classification).toBe('best');
  });

  it('gives !! (not !!!) when the queen moves away from a piece it was guarding', () => {
    // The queen on d3 guards the knight on f5 against the rook; Qd4 leaves it to be taken.
    const fen = '5rk1/8/8/5N2/8/3Q4/8/6K1 w - - 0 1';
    expect(findSacrifice(fen, 'd3d4')).toMatchObject({ square: 'f5', piece: 'n', amount: 3 });
    const j = classifyMove({ fenBefore: fen, uci: 'd3d4', bestMove: 'd3d4', bestScore: { cp: 160 }, playedScore: { cp: 160 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! for leaving a piece hanging to play the best move', () => {
    // 15...Nc6!! leaves the rook on a8 to the bishop, but Bxa8 Nxd4 wins the queen; every other move loses.
    const fen = 'rn2k2r/pB1bbppp/5n2/8/2pQ4/6P1/P3PP1P/1N3RK1 b kq - 0 15';
    const base = { fenBefore: fen, uci: 'b8c6', bestMove: 'b8c6', secondBestScore: { cp: 393 } } as const;
    expect(classifyMove({ ...base, bestScore: { cp: -187 }, playedScore: { cp: -207 } }).classification).toBe('brilliant');
    // When it only keeps the balance it is the best move, not a brilliant one.
    expect(classifyMove({ ...base, bestScore: { cp: -20 }, playedScore: { cp: -20 } }).classification).not.toBe('brilliant');
  });

  it('gives !! for a piece offered that cannot be taken, once it gives the advantage', () => {
    // Nf5 uncovers the rook on the queen: gxf5 Rxd7.
    const fen = '6k1/3q1p2/6p1/8/3N4/8/8/3RK3 w - - 0 1';
    const base = { fenBefore: fen, uci: 'd4f5', bestMove: 'd4f5' } as const;
    expect(classifyMove({ ...base, bestScore: { cp: 150 }, playedScore: { cp: 150 } }).classification).toBe('brilliant');
    // Its material always "comes back", so at an equal score it is not special.
    const line = ['g6f5', 'd1d7'];
    expect(classifyMove({ ...base, bestScore: { cp: 0 }, playedScore: { cp: 0 }, playedLine: line }).classification).toBe('best');
  });

  it('gives !! for an exchange sacrifice that gives the advantage', () => {
    const j = classifyMove({ fenBefore: '6k1/4p3/3n4/8/5B2/8/8/3R2K1 w - - 0 1', uci: 'd1d6', bestMove: 'd1d6', bestScore: { cp: 160 }, playedScore: { cp: 150 } });
    expect(j.classification).toBe('brilliant');
  });

  it('gives !! for a mate that lets go a piece which was lost anyway', () => {
    // Rd2+! Kxe4 Nd6#: the king takes the knight it was attacking, and walks into mate.
    const fen = '2r5/8/8/pNp1r2p/4NppP/1P1k4/2R2K2/8 w - - 0 43';
    expect(findSacrifice(fen, 'c2d2')).toMatchObject({ square: 'e4', piece: 'n', lostAnyway: true });
    const base = { fenBefore: fen, uci: 'c2d2', bestMove: 'c2d2' } as const;
    expect(classifyMove({ ...base, bestScore: { mate: 2 }, playedScore: { mate: 1 } }).classification).toBe('brilliant');
    // Without a mate, giving up what was lost anyway is no sacrifice.
    expect(classifyMove({ ...base, bestScore: { cp: 300 }, playedScore: { cp: 300 } }).classification).toBe('best');
  });

  it('gives no sacrifice badge for turning a mate in one into a longer one', () => {
    // Qg8# was there; Qf6+ gives up the bishop and mates a move later.
    const fen = '5B1k/5Q1B/7p/1ppp4/3P4/4P1P1/5P1K/4R3 w - - 0 30';
    const j = classifyMove({ fenBefore: fen, uci: 'f7f6', bestMove: 'f7g8', bestScore: { mate: 1 }, secondBestScore: { mate: 1 }, playedScore: { mate: 1 } });
    expect(j.classification).toBe('best');
  });

  it('gives !! to a sacrifice in a won position when it is the only easy win', () => {
    // The engine's second choice is only +1: the sacrifice is a combination, not one of many winning moves.
    const j = classifyMove({ fenBefore: KNIGHT_OFFER, uci: 'd4f5', bestMove: 'd4f5', bestScore: { cp: 700 }, secondBestScore: { cp: 100 }, playedScore: { cp: 700 } });
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
