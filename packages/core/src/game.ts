import { Chess, type Move as ChessJsMove } from 'chess.js';
import type { Color, GameEndReason, GameResult, Square } from './types';

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface PlayedMove {
  san: string;
  uci: string;
  from: Square;
  to: Square;
  color: Color;
  piece: string;
  captured?: string;
  promotion?: string;
  fenAfter: string;
  isCheck: boolean;
}

export interface GameOutcome {
  result: GameResult;
  reason: GameEndReason;
  winner: Color | null;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function toUci(m: { from: string; to: string; promotion?: string }): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}

export function parseUci(uci: string): MoveInput {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) throw new Error(`Invalid UCI move: ${uci}`);
  return { from: m[1] as Square, to: m[2] as Square, promotion: m[3] as MoveInput['promotion'] };
}

function toPlayed(m: ChessJsMove, fenAfter: string, isCheck: boolean): PlayedMove {
  return {
    san: m.san,
    uci: toUci(m),
    from: m.from as Square,
    to: m.to as Square,
    color: m.color,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    fenAfter,
    isCheck,
  };
}

/**
 * Rules wrapper used by every client and the server. Thin layer over
 * chess.js that exposes UCI-first moves and a single outcome check.
 */
export class Game {
  private chess: Chess;
  readonly startFen: string;

  constructor(fen: string = START_FEN) {
    this.chess = new Chess(fen);
    this.startFen = this.chess.fen();
  }

  static fromUciMoves(moves: string[], fen: string = START_FEN): Game {
    const g = new Game(fen);
    for (const m of moves) {
      if (!g.move(m)) throw new Error(`Illegal move in sequence: ${m}`);
    }
    return g;
  }

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get inCheck(): boolean {
    return this.chess.inCheck();
  }

  get ply(): number {
    return this.chess.history().length;
  }

  /** Underlying chess.js instance for read-only queries. */
  get raw(): Chess {
    return this.chess;
  }

  isLegal(move: MoveInput | string): boolean {
    const input = typeof move === 'string' ? parseUci(move) : move;
    return this.chess
      .moves({ square: input.from, verbose: true })
      .some((m) => m.to === input.to && (!m.promotion || m.promotion === (input.promotion ?? 'q')));
  }

  /** Plays a move; returns null when illegal instead of throwing. */
  move(move: MoveInput | string): PlayedMove | null {
    const input = typeof move === 'string' ? parseUci(move) : move;
    try {
      const m = this.chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? 'q' });
      return toPlayed(m, this.chess.fen(), this.chess.inCheck());
    } catch {
      return null;
    }
  }

  undo(): PlayedMove | null {
    const m = this.chess.undo();
    return m ? toPlayed(m, m.before, false) : null;
  }

  legalMoves(from?: Square): { from: Square; to: Square; promotion?: string; san: string }[] {
    const moves = from ? this.chess.moves({ square: from, verbose: true }) : this.chess.moves({ verbose: true });
    return moves.map((m) => ({ from: m.from as Square, to: m.to as Square, promotion: m.promotion, san: m.san }));
  }

  history(): PlayedMove[] {
    return this.chess.history({ verbose: true }).map((m) => {
      const probe = new Chess(m.after);
      return toPlayed(m, m.after, probe.inCheck());
    });
  }

  uciHistory(): string[] {
    return this.chess.history({ verbose: true }).map(toUci);
  }

  /** Outcome determined by the board alone (no clocks/resignations). */
  boardOutcome(): GameOutcome | null {
    const c = this.chess;
    if (c.isCheckmate()) {
      const winner: Color = c.turn() === 'w' ? 'b' : 'w';
      return { result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner };
    }
    if (c.isStalemate()) return draw('stalemate');
    if (c.isInsufficientMaterial()) return draw('insufficient_material');
    if (c.isThreefoldRepetition()) return draw('threefold_repetition');
    if (c.isDrawByFiftyMoves()) return draw('fifty_move_rule');
    return null;
  }

  /**
   * Can `color` still deliver mate with any sequence of legal moves?
   * Used to turn a flag into a draw (FIDE 6.9). Conservative approximation:
   * a lone king, or king + single minor piece, cannot win.
   */
  hasMatingMaterial(color: Color): boolean {
    const pieces = this.chess
      .board()
      .flat()
      .filter((p): p is NonNullable<typeof p> => p !== null && p.color === color && p.type !== 'k');
    if (pieces.length === 0) return false;
    if (pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b')) return false;
    return true;
  }

  pgn(headers: Record<string, string> = {}): string {
    const c = new Chess(this.startFen);
    for (const [k, v] of Object.entries(headers)) c.setHeader(k, v);
    for (const m of this.uciHistory()) c.move(parseUci(m));
    return c.pgn();
  }
}

function draw(reason: GameEndReason): GameOutcome {
  return { result: '1/2-1/2', reason, winner: null };
}

export function outcomeFor(reason: GameEndReason, winner: Color | null): GameOutcome {
  if (winner === null) return draw(reason);
  return { result: winner === 'w' ? '1-0' : '0-1', reason, winner };
}
