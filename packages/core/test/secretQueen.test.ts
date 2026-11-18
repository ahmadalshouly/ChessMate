import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { SecretQueenGame, type SecretMoveResult } from '../src';

function play(g: SecretQueenGame, uci: string): SecretMoveResult {
  const r = g.move(g.turn, uci);
  if (!('played' in r)) throw new Error(`${uci} refused: ${r.kind}`);
  return r;
}

describe('Secret Queen', () => {
  it('needs a secret before the first move, and only a pawn of your own', () => {
    const g = new SecretQueenGame();
    expect(g.move('w', 'e2e4')).toEqual({ kind: 'secret_required' });
    expect(g.pick('w', 'e7')).toBe(false);
    expect(g.pick('w', 'e1')).toBe(false);
    expect(g.pick('w', 'e2')).toBe(true);
    expect(g.pick('w', 'd2')).toBe(false); // only once
    play(g, 'e2e4');
    expect(g.secretOf('w')).toBe('e4');
    // Black can still pick before their first move, but not after.
    expect(g.pick('b', 'a7')).toBe(true);
    expect(g.pickable('w')).toEqual([]);
  });

  it('a pawn-shaped move keeps the secret; a queen move reveals it', () => {
    const g = new SecretQueenGame();
    g.pick('w', 'e2');
    g.pick('b', 'a7');
    expect(play(g, 'e2e4').reveals).toEqual([]);
    expect(g.raw.get('e4')).toEqual({ type: 'p', color: 'w' });
    play(g, 'a7a6');
    // The hidden queen can already move like a queen.
    expect(g.legalMoves('e4').map((m) => m.to)).toContain('h7');
    const r = play(g, 'e4h7');
    expect(r.reveals).toEqual([{ ply: 2, color: 'w', square: 'e4', cause: 'moved' }]);
    expect(r.played.san).toBe('Qxh7');
    expect(g.raw.get('h7')).toEqual({ type: 'q', color: 'w' });
    expect(g.secretOf('w')).toBeNull();
  });

  it('reveals a hidden queen that gives check', () => {
    const g = new SecretQueenGame();
    g.pick('w', 'b2');
    g.pick('b', 'a7');
    play(g, 'b2b4');
    play(g, 'd7d6');
    const r = play(g, 'b4b5');
    expect(r.reveals).toEqual([{ ply: 3, color: 'w', square: 'b5', cause: 'check' }]);
    expect(g.inCheck).toBe(true);
    expect(g.raw.get('b5')).toEqual({ type: 'q', color: 'w' });
  });

  it('refuses a move the hidden queen makes illegal, and reveals it', () => {
    const g = new SecretQueenGame('4k3/4p3/8/8/8/8/P3R3/4K3 w - - 0 1');
    g.pick('w', 'a2');
    g.pick('b', 'e7');
    const res = g.move('w', 'e2d2');
    expect(res).toEqual({ kind: 'blocked', reveal: { ply: 0, color: 'b', square: 'e7', cause: 'blocked' } });
    // The server applies the reveal; now the pin is visible and the move is just illegal.
    if ('kind' in res && res.kind === 'blocked') g.applyReveal(res.reveal);
    expect(g.raw.get('e7')).toEqual({ type: 'q', color: 'b' });
    expect(g.move('w', 'e2d2')).toEqual({ kind: 'illegal' });
    expect(g.ply).toBe(0);
  });

  it('capturing a disguised queen reports it', () => {
    const g = new SecretQueenGame();
    g.pick('w', 'a2');
    g.pick('b', 'd7');
    play(g, 'e2e4');
    play(g, 'd7d5');
    const r = play(g, 'e4d5');
    expect(r.reveals).toEqual([{ ply: 3, color: 'b', square: 'd5', cause: 'captured' }]);
    expect(g.secretOf('b')).toBeNull();
  });

  it('judges mate on the real position', () => {
    // Black looks mated by Rh8, but the pawn on g7 is a queen and takes the rook.
    const g = new SecretQueenGame('k7/pp4p1/8/8/8/8/P7/4K2R w - - 0 1');
    g.pick('w', 'a2');
    g.pick('b', 'g7');
    play(g, 'h1h8');
    expect(new Chess(g.fen).isCheckmate()).toBe(true);
    expect(g.boardOutcome()).toBeNull();
    expect(g.legalMoves().map((m) => `${m.from}${m.to}`)).toContain('g7h8');
  });

  it('a hidden queen reaching the last rank is revealed', () => {
    const g = new SecretQueenGame('4k3/1P6/8/8/8/8/p7/4K3 w - - 0 1');
    g.pick('w', 'b7');
    g.pick('b', 'a2');
    const r = play(g, 'b7b8');
    expect(r.reveals[0]).toMatchObject({ square: 'b7', cause: 'promoted' });
    expect(g.raw.get('b8')).toEqual({ type: 'q', color: 'w' });
  });

  it('clients rebuild the same board from public moves and reveals', () => {
    const g = new SecretQueenGame();
    g.pick('w', 'e2');
    g.pick('b', 'd7');
    for (const m of ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3']) play(g, m);
    const spectator = SecretQueenGame.replay(g.startFen, g.uciHistory(), g.info(null));
    expect(spectator.fen).toBe(g.fen);
    expect(spectator.secretOf('w')).toBeNull();
    const white = SecretQueenGame.replay(g.startFen, g.uciHistory(), g.info('w'), 'w');
    expect(white.secretOf('w')).toBeNull(); // white's secret was taken on d5
    expect(g.pgn({ Result: '*' })).toContain('[Variant "Secret Queen"]');
  });

  it('a client follows remote moves and keeps its own secret', () => {
    const server = new SecretQueenGame();
    server.pick('w', 'b2');
    server.pick('b', 'h7');
    const black = new SecretQueenGame();
    black.pick('b', 'h7');
    black.markPicked('w');
    for (const m of ['b2b4', 'h7h6', 'e2e3', 'd7d6', 'b4b5']) {
      const r = play(server, m);
      black.applyRemote(m, r.reveals);
    }
    expect(black.fen).toBe(server.fen);
    expect(black.secretOf('b')).toBe('h6');
    expect(black.raw.get('b5')).toEqual({ type: 'q', color: 'w' });
  });
});
