import { describe, expect, it } from 'vitest';

import { SecretQueenGame, fenWithPiece, queenAttacks, secretQueenTargets } from '../src/secretQueen';

const pieceAt = (fen: string, sq: string) => {
  const rows = fen.split(' ')[0]!.split('/');
  const row = rows[8 - Number(sq[1])]!;
  let file = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) file += Number(ch);
    else {
      if ('abcdefgh'[file] === sq[0]) return ch;
      file++;
    }
  }
  return null;
};

describe('Secret Queen', () => {
  it('edits FEN squares and finds queen lines', () => {
    const fen = fenWithPiece('4k3/8/8/8/3p4/8/8/4K3 w - - 0 1', 'd4', 'q');
    expect(pieceAt(fen, 'd4')).toBe('q');
    expect(queenAttacks(fen, 'd4', 'd1')).toBe(true);
    expect(queenAttacks(fen, 'd4', 'e2')).toBe(false);
  });

  it('keeps the secret while it moves like a pawn and reveals it on a queen move', () => {
    const g = new SecretQueenGame();
    expect(g.pick('w', 'd2')).toBe(true);
    expect(g.pick('w', 'e1')).toBe(false); // not a pawn
    expect(g.move('e2e4')).not.toBeNull();
    expect(g.pick('w', 'c2')).toBe(false); // too late: white has moved
    expect(g.pick('b', 'a7')).toBe(true);
    expect(g.move('e7e5')).not.toBeNull();
    expect(pieceAt(g.fen, 'd2')).toBe('P');
    // d2 to h6 along the diagonal: only a queen can do that.
    const m = g.move('d2h6');
    expect(m?.san.startsWith('Q')).toBe(true);
    expect(pieceAt(g.fen, 'h6')).toBe('Q');
    expect(g.secretOf('w')).toBeNull();
    expect(g.lastReveals()).toEqual([{ color: 'w', square: 'd2', reason: 'moved' }]);
  });

  it('reveals a hidden queen that gives check', () => {
    const g = new SecretQueenGame();
    g.pick('w', 'h2');
    g.pick('b', 'a7');
    expect(g.move('h2h4')).not.toBeNull();
    expect(g.secretOf('w')).toBe('h4');
    expect(g.move('f7f6')).not.toBeNull();
    const m = g.move('h4h5');
    expect(m?.isCheck).toBe(true);
    expect(g.lastReveals()[0]).toMatchObject({ color: 'w', reason: 'check' });
    expect(pieceAt(g.fen, 'h5')).toBe('Q');
    expect(g.inCheck).toBe(true);
  });

  it('refuses a move that is illegal only because of the hidden queen, and reveals it', () => {
    const g = new SecretQueenGame('4k3/8/8/8/3p4/8/8/4K3 w - - 0 1');
    expect(g.pick('b', 'd4')).toBe(true);
    // To white, d1 looks safe (a pawn on d4), but the secret queen covers the d-file.
    expect(g.move('e1d1')).toBeNull();
    expect(g.takeRejectedReveal()).toEqual({ color: 'b', square: 'd4', reason: 'blocked' });
    expect(pieceAt(g.fen, 'd4')).toBe('q');
    expect(g.ply).toBe(0);
    expect(g.move('e1e2')).not.toBeNull();
  });

  it('takes the secret with a captured pawn', () => {
    const g = new SecretQueenGame('4k3/8/8/8/3p4/4P3/8/4K3 w - - 0 1');
    g.pick('b', 'd4');
    expect(g.move('e3d4')).not.toBeNull();
    expect(g.secretOf('b')).toBeNull();
    expect(g.lastReveals()).toEqual([{ color: 'b', square: 'd4', reason: 'captured' }]);
  });

  it('shows the owner queen moves for the secret pawn', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(secretQueenTargets(start, 'w', 'd2', 'd2')).toEqual([]); // not white's turn
    const white = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const t = secretQueenTargets(white, 'w', 'd2', 'd2');
    expect(t).toContain('d4');
    expect(t).toContain('h6');
    expect(secretQueenTargets(white, 'w', 'c2', 'd2')).not.toContain('h7');
  });

  it('picks a random pawn for a player who did not choose', () => {
    const g = new SecretQueenGame(undefined, () => 0);
    expect(g.move('e2e4')).not.toBeNull();
    // The board is read from a8 to h1, so with random() = 0 the first white pawn is a2.
    expect(g.secretOf('w')).toBe('a2');
  });
});
