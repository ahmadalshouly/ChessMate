import { describe, expect, it } from 'vitest';

import { importPosition } from '../src/analysis';
import { Game, START_FEN } from '../src/game';
import {
  EMPTY_BOARD_FEN,
  castlingAllowed,
  emptySetup,
  fenBoard,
  fenProblem,
  movePiece,
  parseSetupFen,
  putPiece,
  setupFen,
  setupProblem,
  startingSetup,
  type Setup,
} from '../src/setup';

const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
const fen = (s: Setup | null) => setupFen(s!);

describe('board editor FEN', () => {
  it('round-trips the starting position and ordinary FENs', () => {
    expect(setupFen(startingSetup())).toBe(START_FEN);
    expect(fen(parseSetupFen(KINGS))).toBe(KINGS);
    const sicilian = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
    expect(fen(parseSetupFen(sicilian))).toBe(sicilian);
  });

  it('fills in missing fields', () => {
    expect(fen(parseSetupFen('4k3/8/8/8/8/8/8/4K3'))).toBe(KINGS);
    expect(fen(parseSetupFen('  4k3/8/8/8/8/8/8/4K3 b  '))).toBe('4k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it('reads boards the rules engine refuses, such as an empty one', () => {
    expect(fen(parseSetupFen(EMPTY_BOARD_FEN))).toBe(EMPTY_BOARD_FEN);
    expect(fen(parseSetupFen('8/8/8/8/8/8/8/KKKK4 w - - 0 1'))).toBe('8/8/8/8/8/8/8/KKKK4 w - - 0 1');
  });

  it('rejects text that is not a FEN', () => {
    for (const bad of ['', 'hello', '8/8/8/8/8/8/8 w - - 0 1', '9/8/8/8/8/8/8/8 w', '8/8/8/8/8/8/8/7 w', 'x7/8/8/8/8/8/8/8', `${KINGS} extra`, '4k3/8/8/8/8/8/8/4K3 x', '4k3/8/8/8/8/8/8/4K3 w KX']) {
      expect(parseSetupFen(bad), bad).toBeNull();
    }
  });

  it('writes castling only where king and rook stand on their home squares', () => {
    const s = parseSetupFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')!;
    expect(setupFen(s)).toBe('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    // The h1 rook leaves: White's short castling goes, the others stay.
    const moved = movePiece(s, 'h1', 'h2');
    expect(setupFen(moved)).toBe('r3k2r/8/8/8/8/8/7R/R3K3 w Qkq - 0 1');
    // ...and comes back when the rook returns, since the player still wants it.
    expect(setupFen(movePiece(moved, 'h2', 'h1'))).toBe('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(castlingAllowed(parseSetupFen(KINGS)!.board)).toEqual({ K: false, Q: false, k: false, q: false });
  });

  it('turns castling on by itself on a cleared board once king and rook are home', () => {
    let s = emptySetup();
    s = putPiece(s, 'e1', { color: 'w', type: 'k' });
    s = putPiece(s, 'h1', { color: 'w', type: 'r' });
    s = putPiece(s, 'e8', { color: 'b', type: 'k' });
    expect(setupFen(s)).toBe('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(setupFen({ ...s, castling: { ...s.castling, K: false } })).toBe('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
  });

  it('keeps an en passant square only while the board fits it', () => {
    const s = parseSetupFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2')!;
    expect(setupFen(s)).toBe('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    // Black's d-pawn gone, or the move handed to Black: no en passant.
    expect(setupFen(putPiece(s, 'd5', null))).toBe('4k3/8/8/4P3/8/8/8/4K3 w - - 0 2');
    expect(setupFen({ ...s, turn: 'b' })).toBe('4k3/8/8/3pP3/8/8/8/4K3 b - - 0 2');
  });

  it('starts the fifty-move count again when a piece is placed, moved or removed', () => {
    const s = parseSetupFen('4k3/8/8/8/8/8/8/4K3 w - - 37 60')!;
    expect(putPiece(s, 'a1', { color: 'w', type: 'q' }).halfmove).toBe(0);
    expect(movePiece(s, 'e1', 'd1').halfmove).toBe(0);
    expect(putPiece(s, 'a1', null).fullmove).toBe(60);
  });

  it('moves a piece onto an occupied square, replacing it', () => {
    const s = movePiece(startingSetup(), 'd1', 'd7');
    expect(s.board.d7).toEqual({ color: 'w', type: 'q' });
    expect(s.board.d1).toBeUndefined();
    expect(movePiece(s, 'a3', 'a4')).toBe(s);
  });
});

describe('setupProblem', () => {
  const problem = (f: string) => setupProblem(parseSetupFen(f)!);

  it('accepts legal positions', () => {
    expect(problem(START_FEN)).toBeNull();
    expect(problem(KINGS)).toBeNull();
    expect(problem('4k3/4Q3/8/8/8/8/8/4K3 b - - 0 1')).toBeNull();
  });

  it('needs exactly one king a side', () => {
    expect(problem(EMPTY_BOARD_FEN)).toBe('whiteKing');
    expect(problem('4k3/8/8/8/8/8/8/8 w - - 0 1')).toBe('whiteKing');
    expect(problem('4k3/8/8/8/8/8/8/3KK3 w - - 0 1')).toBe('whiteKing');
    expect(problem('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('blackKing');
    expect(problem('3kk3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('blackKing');
  });

  it('refuses pawns on the first or last rank', () => {
    expect(problem('P3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('pawnsOnEdge');
    expect(problem('4k3/8/8/8/8/8/8/p3K3 w - - 0 1')).toBe('pawnsOnEdge');
  });

  it('refuses more than 16 pieces or 8 pawns a side', () => {
    expect(problem('4k3/8/8/8/8/PPPPPPPP/PPPPPPPP/4K3 w - - 0 1')).toBe('tooManyPieces');
    expect(problem('4k3/8/8/8/8/1N6/PPPPPPPP/QQQQKQQQ w - - 0 1')).toBe('tooManyPieces');
    // Exactly 16 (eight pawns, seven promoted queens and the king) is fine.
    expect(problem('4k3/8/8/8/8/8/PPPPPPPP/QQQQKQQQ w - - 0 1')).toBeNull();
  });

  it('refuses a position where the side that just moved is in check', () => {
    // White to move, but Black's king is attacked.
    expect(problem('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1')).toBe('oppositeCheck');
    // Kings side by side are always one of these.
    expect(problem('8/8/8/8/8/8/8/4Kk2 w - - 0 1')).toBe('oppositeCheck');
  });

  it('reads FEN strings too', () => {
    expect(fenProblem(START_FEN)).toBeNull();
    expect(fenProblem('nonsense')).toBe('invalid');
    expect(fenProblem(EMPTY_BOARD_FEN)).toBe('whiteKing');
  });

  it('only passes FENs the rules engine also accepts', () => {
    for (const f of [START_FEN, KINGS, '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 5 20']) {
      expect(new Game(fen(parseSetupFen(f))).fen).toBe(f);
    }
  });
});

describe('importPosition with an illegal FEN', () => {
  it('turns it away, so the analysis board opens the editor instead', () => {
    expect(importPosition('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
    expect(importPosition('4k3/4Q3/8/8/8/8/8/4K3 b - - 0 1')).not.toBeNull();
  });
});

describe('fenBoard', () => {
  it('lays out pieces from rank 8 to rank 1', () => {
    const rows = fenBoard(START_FEN);
    expect(rows).toHaveLength(8);
    expect(rows[0]![4]).toEqual({ color: 'b', type: 'k' });
    expect(rows[7]![4]).toEqual({ color: 'w', type: 'k' });
    expect(rows[4]!.every((p) => p === null)).toBe(true);
  });

  it('draws positions without kings, and an empty board for junk', () => {
    expect(fenBoard(EMPTY_BOARD_FEN).flat().every((p) => p === null)).toBe(true);
    expect(fenBoard('8/8/8/8/8/8/8/Q7 w - - 0 1')[7]![0]).toEqual({ color: 'w', type: 'q' });
    expect(fenBoard('junk').flat().filter(Boolean)).toHaveLength(0);
  });

  it('matches the rules engine on legal positions', () => {
    const f = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const fromRules = new Game(f).raw.board().map((row) => row.map((p) => (p ? { color: p.color, type: p.type } : null)));
    expect(fenBoard(f)).toEqual(fromRules);
  });
});
