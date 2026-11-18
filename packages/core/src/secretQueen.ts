import { Chess, type Move as ChessJsMove } from 'chess.js';

import { START_FEN, parseUci, type GameOutcome, type MoveInput, type PlayedMove } from './game';
import { opposite, type Color, type Square } from './types';

/**
 * Secret Queen: before their first move each player secretly picks one of
 * their pawns. That pawn is really a queen. It looks and can move like a pawn,
 * and it stays hidden until it has to be exposed:
 *
 * - it makes a move a pawn could not make (moves like a queen), or reaches the
 *   last rank;
 * - it gives check (directly or by discovery);
 * - the opponent tries a move that the hidden queen makes illegal (walking
 *   into it, moving a piece it pins, castling through its line). The move is
 *   refused and the queen is revealed, so nobody is forced into an illegal
 *   move they could not see;
 * - it is captured while still disguised (the capturer just took a queen).
 *
 * Once revealed it is an ordinary queen on the board. A disguised queen cannot
 * capture en passant (it is a queen, not a pawn), but it can be captured en
 * passant after a disguised double step, since everyone sees a pawn.
 *
 * The server holds both secrets. Each client holds only its own, and replays
 * the public moves plus the reveals the server sends.
 */
export type Variant = 'standard' | 'secretQueen';

export const VARIANTS: readonly Variant[] = ['standard', 'secretQueen'];

export function isVariant(v: unknown): v is Variant {
  return v === 'standard' || v === 'secretQueen';
}

/** Why a secret queen was shown. */
export type RevealCause = 'moved' | 'promoted' | 'check' | 'blocked' | 'captured' | 'gameEnd';

export interface SecretReveal {
  /** Number of moves played when the reveal took effect (it applies before move `ply`, after move `ply - 1`). */
  ply: number;
  color: Color;
  square: Square;
  cause: RevealCause;
}

/** Reveals that turn the pawn on the square into a queen. The others only report where the secret was. */
export function revealTurnsQueen(cause: RevealCause): boolean {
  return cause === 'moved' || cause === 'promoted' || cause === 'check' || cause === 'blocked';
}

/** Secret Queen state in a game snapshot. `yours` is only ever sent to its owner. */
export interface SecretQueenInfo {
  picked: Record<Color, boolean>;
  /** Your hidden queen's square while it is still hidden. */
  yours: Square | null;
  reveals: SecretReveal[];
}

export type SecretMoveCheck =
  | { kind: 'ok'; plan: SecretMovePlan }
  | { kind: 'illegal' }
  | { kind: 'secret_required' }
  /** The move is legal on the visible board but the opponent's hidden queen forbids it. */
  | { kind: 'blocked'; reveal: SecretReveal };

export interface SecretMovePlan {
  color: Color;
  input: MoveInput;
  /** The move is made by the mover's still hidden queen. */
  bySecret: boolean;
  /** The hidden queen exposes itself by making this move. */
  reveal: 'moved' | 'promoted' | null;
}

export interface SecretMoveResult {
  played: PlayedMove;
  /** Reveals caused by this move, in the order they happened. */
  reveals: SecretReveal[];
}

function fileOf(sq: Square) {
  return sq.charCodeAt(0) - 97;
}
function rankOf(sq: Square) {
  return Number(sq[1]);
}
function sqAt(file: number, rank: number): Square {
  return `${String.fromCharCode(97 + file)}${rank}` as Square;
}

/** Does a queen on `from` attack `target` on this board? */
export function queenAttacks(board: Chess, from: Square, target: Square): boolean {
  const df = fileOf(target) - fileOf(from);
  const dr = rankOf(target) - rankOf(from);
  if (df === 0 && dr === 0) return false;
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return false;
  const sf = Math.sign(df);
  const sr = Math.sign(dr);
  let f = fileOf(from) + sf;
  let r = rankOf(from) + sr;
  while (f !== fileOf(target) || r !== rankOf(target)) {
    if (board.get(sqAt(f, r))) return false;
    f += sf;
    r += sr;
  }
  return true;
}

function kingSquare(board: Chess, color: Color): Square | null {
  return (board.findPiece({ type: 'k', color })[0] as Square | undefined) ?? null;
}

function toPlayed(m: ChessJsMove, board: Chess): PlayedMove {
  return {
    san: m.san,
    uci: `${m.from}${m.to}${m.promotion ?? ''}`,
    from: m.from as Square,
    to: m.to as Square,
    color: m.color,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    fenAfter: board.fen(),
    isCheck: board.inCheck(),
  };
}

function lastRank(color: Color) {
  return color === 'w' ? 8 : 1;
}

export class SecretQueenGame {
  /** The board everyone sees: hidden queens are pawns, revealed ones are queens. */
  private board: Chess;
  readonly startFen: string;
  /** Still hidden (and alive) secret queens this instance knows about. */
  private secrets: Record<Color, Square | null> = { w: null, b: null };
  private picked: Record<Color, boolean> = { w: false, b: false };
  private played: PlayedMove[] = [];
  private revealList: SecretReveal[] = [];

  constructor(fen: string = START_FEN) {
    this.board = new Chess(fen);
    this.startFen = this.board.fen();
  }

  /**
   * Rebuilds a game from what a client is told: the public moves, the public
   * reveals and (for a player) their own secret.
   */
  static replay(initialFen: string, moves: string[], info: SecretQueenInfo, you?: Color): SecretQueenGame {
    const g = new SecretQueenGame(initialFen);
    g.picked = { ...info.picked };
    for (let p = 0; p <= moves.length; p++) {
      for (const r of info.reveals) if (r.ply === p) g.applyReveal(r);
      if (p === moves.length) break;
      const input = parseUci(moves[p]!);
      let m: ChessJsMove;
      try {
        m = g.board.move({ from: input.from, to: input.to, promotion: input.promotion });
      } catch {
        throw new Error(`Illegal move in sequence: ${moves[p]}`);
      }
      g.played.push(toPlayed(m, g.board));
    }
    if (you) g.secrets[you] = info.yours;
    return g;
  }

  get fen(): string {
    return this.board.fen();
  }
  get turn(): Color {
    return this.board.turn();
  }
  get ply(): number {
    return this.played.length;
  }
  get inCheck(): boolean {
    return this.board.inCheck();
  }
  /** The public board, for read-only queries. */
  get raw(): Chess {
    return this.board;
  }
  get reveals(): readonly SecretReveal[] {
    return this.revealList;
  }

  secretOf(color: Color): Square | null {
    return this.secrets[color];
  }
  hasPicked(color: Color): boolean {
    return this.picked[color];
  }

  info(viewer: Color | null): SecretQueenInfo {
    return { picked: { ...this.picked }, yours: viewer ? this.secrets[viewer] : null, reveals: [...this.revealList] };
  }

  /** Squares `color` may pick: their pawns, before their first move. */
  pickable(color: Color): Square[] {
    if (this.picked[color] || this.played.some((m) => m.color === color)) return [];
    return this.board.findPiece({ type: 'p', color }) as Square[];
  }

  pick(color: Color, square: Square): boolean {
    if (!this.pickable(color).includes(square)) return false;
    this.picked[color] = true;
    this.secrets[color] = square;
    return true;
  }

  /** A client learns that the opponent picked, without learning where. */
  markPicked(color: Color) {
    this.picked[color] = true;
  }

  /** Public board with the given player's hidden queen shown as a queen: what that player moves on. */
  fenFor(color: Color): string {
    return this.withQueens([color]).fen();
  }

  private withQueens(colors: Color[]): Chess {
    const c = new Chess(this.board.fen());
    for (const color of colors) {
      const sq = this.secrets[color];
      if (sq) c.put({ type: 'q', color }, sq);
    }
    return c;
  }

  /** Legal moves for the side to move as far as that side knows (its own hidden queen moves as a queen). */
  legalMoves(from?: Square): { from: Square; to: Square; promotion?: string; san: string }[] {
    const b = this.withQueens([this.turn]);
    const moves = from ? b.moves({ square: from, verbose: true }) : b.moves({ verbose: true });
    return moves.map((m) => ({ from: m.from as Square, to: m.to as Square, promotion: m.promotion, san: m.san }));
  }

  /** Checks a move without changing anything. The server knows both secrets, so only it can see `blocked`. */
  check(color: Color, uci: string): SecretMoveCheck {
    if (color !== this.turn) return { kind: 'illegal' };
    if (!this.picked[color]) return { kind: 'secret_required' };
    let input: MoveInput;
    try {
      input = parseUci(uci);
    } catch {
      return { kind: 'illegal' };
    }
    const mine = this.withQueens([color]);
    const legal = mine
      .moves({ square: input.from, verbose: true })
      .find((m) => m.to === input.to && (m.promotion ?? null) === (input.promotion ?? null));
    if (!legal) return { kind: 'illegal' };

    const opp = opposite(color);
    const hidden = this.secrets[opp];
    if (hidden) {
      const captured = legal.isEnPassant() ? sqAt(fileOf(input.to), rankOf(input.from)) : input.to;
      const blocked = () => ({ kind: 'blocked' as const, reveal: { ply: this.ply, color: opp, square: hidden, cause: 'blocked' as const } });
      if (legal.isKingsideCastle() || legal.isQueensideCastle()) {
        const before = this.withQueens([color, opp]);
        const r = rankOf(input.from);
        const through = sqAt(legal.isKingsideCastle() ? 5 : 3, r);
        if (before.isAttacked(through, opp) || before.isAttacked(input.from, opp)) return blocked();
      }
      if (captured !== hidden) {
        const after = new Chess(mine.fen());
        after.move({ from: input.from, to: input.to, promotion: input.promotion });
        after.put({ type: 'q', color: opp }, hidden);
        const k = kingSquare(after, color);
        if (k && after.isAttacked(k, opp)) return blocked();
      }
    }

    const bySecret = this.secrets[color] === input.from;
    let reveal: SecretMovePlan['reveal'] = null;
    if (bySecret) {
      const asPawn = this.board
        .moves({ square: input.from, verbose: true })
        .some((m) => m.to === input.to && !m.promotion && !m.isEnPassant());
      if (rankOf(input.to) === lastRank(color)) reveal = 'promoted';
      else if (!asPawn) reveal = 'moved';
    }
    return { kind: 'ok', plan: { color, input, bySecret, reveal } };
  }

  /** Applies a move that `check` accepted. */
  commit(plan: SecretMovePlan): SecretMoveResult {
    const { color, input } = plan;
    const opp = opposite(color);
    const reveals: SecretReveal[] = [];
    if (plan.bySecret && plan.reveal) {
      reveals.push(this.applyReveal({ ply: this.ply, color, square: input.from, cause: plan.reveal }));
    }
    const m = this.board.move({ from: input.from, to: input.to, promotion: input.promotion });
    if (plan.bySecret && !plan.reveal) this.secrets[color] = input.to;

    const captured = m.isEnPassant() ? sqAt(fileOf(input.to), rankOf(input.from)) : m.captured ? input.to : null;
    if (captured && captured === this.secrets[opp]) {
      reveals.push(this.applyReveal({ ply: this.ply + 1, color: opp, square: captured, cause: 'captured' }));
    }
    // A hidden queen that now gives check (directly or by discovery) shows itself.
    const mine = this.secrets[color];
    const k = kingSquare(this.board, opp);
    if (mine && k && queenAttacks(this.board, mine, k)) {
      reveals.push(this.applyReveal({ ply: this.ply + 1, color, square: mine, cause: 'check' }));
    }
    const played = toPlayed(m, this.board);
    this.played.push(played);
    return { played, reveals };
  }

  /** Checks and plays in one go; null when illegal for any reason. */
  move(color: Color, uci: string): SecretMoveResult | SecretMoveCheck {
    const c = this.check(color, uci);
    return c.kind === 'ok' ? this.commit(c.plan) : c;
  }

  /**
   * Plays a move the server already accepted, with the reveals it reported.
   * Reveals for squares this client knows are applied once.
   */
  applyRemote(uci: string, reveals: SecretReveal[]): PlayedMove | null {
    for (const r of reveals) if (r.ply === this.ply) this.applyReveal(r);
    const input = parseUci(uci);
    const fromSecret = this.secrets[this.turn] === input.from;
    let m: ChessJsMove;
    try {
      m = this.board.move({ from: input.from, to: input.to, promotion: input.promotion });
    } catch {
      return null;
    }
    if (fromSecret) this.secrets[m.color] = input.to;
    const played = toPlayed(m, this.board);
    this.played.push(played);
    for (const r of reveals) if (r.ply === this.ply) this.applyReveal(r);
    return played;
  }

  /** Records a reveal the server announced (or one this instance found). Idempotent. */
  applyReveal(r: SecretReveal): SecretReveal {
    if (this.revealList.some((x) => x.ply === r.ply && x.square === r.square && x.cause === r.cause)) return r;
    this.revealList.push(r);
    if (revealTurnsQueen(r.cause)) {
      const p = this.board.get(r.square);
      if (p && p.color === r.color && p.type === 'p') this.board.put({ type: 'q', color: r.color }, r.square);
    }
    if (r.cause !== 'gameEnd' && this.secrets[r.color] === r.square) this.secrets[r.color] = null;
    this.picked[r.color] = true;
    return r;
  }

  /** Shows the hidden queens left when the game ends (they stay pawns on the board). */
  revealAll(): SecretReveal[] {
    const out: SecretReveal[] = [];
    for (const color of ['w', 'b'] as const) {
      const sq = this.secrets[color];
      if (sq) out.push(this.applyReveal({ ply: this.ply, color, square: sq, cause: 'gameEnd' }));
    }
    return out;
  }

  history(): PlayedMove[] {
    return [...this.played];
  }

  uciHistory(): string[] {
    return this.played.map((m) => m.uci);
  }

  /** Outcome on the real position (server only: it needs both secrets). */
  boardOutcome(): GameOutcome | null {
    const truth = this.withQueens(['w', 'b']);
    if (truth.isCheckmate()) {
      const winner: Color = truth.turn() === 'w' ? 'b' : 'w';
      return { result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner };
    }
    const draw = (reason: GameOutcome['reason']): GameOutcome => ({ result: '1/2-1/2', reason, winner: null });
    if (truth.isStalemate()) return draw('stalemate');
    if (truth.isInsufficientMaterial()) return draw('insufficient_material');
    if (this.board.isThreefoldRepetition()) return draw('threefold_repetition');
    if (this.board.isDrawByFiftyMoves()) return draw('fifty_move_rule');
    return null;
  }

  hasMatingMaterial(color: Color): boolean {
    const pieces = this.board
      .board()
      .flat()
      .filter((p): p is NonNullable<typeof p> => p !== null && p.color === color && p.type !== 'k');
    if (pieces.length === 0) return false;
    if (pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b')) return false;
    return true;
  }

  /** PGN of the public moves with a Variant header and a comment at each reveal. */
  pgn(headers: Record<string, string> = {}): string {
    const all: Record<string, string> = { ...headers, Variant: 'Secret Queen' };
    if (this.startFen !== START_FEN) {
      all.SetUp = '1';
      all.FEN = this.startFen;
    }
    const lines = Object.entries(all).map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`);
    const startMove = Number(this.startFen.split(' ')[5] ?? 1);
    const blackFirst = this.startFen.split(' ')[1] === 'b';
    const parts: string[] = [];
    const note = (ply: number) =>
      this.revealList
        .filter((r) => r.ply === ply)
        .map((r) => `{${r.color === 'w' ? 'White' : 'Black'} secret queen on ${r.square} (${r.cause})}`);
    parts.push(...note(0));
    this.played.forEach((m, i) => {
      const idx = i + (blackFirst ? 1 : 0);
      const num = startMove + Math.floor(idx / 2);
      if (idx % 2 === 0) parts.push(`${num}.`);
      else if (i === 0) parts.push(`${num}...`);
      parts.push(m.san);
      parts.push(...note(i + 1));
    });
    parts.push(headers.Result ?? '*');
    return `${lines.join('\n')}\n\n${parts.join(' ')}`;
  }
}
