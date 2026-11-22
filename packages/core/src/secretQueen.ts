import { Chess } from 'chess.js';

import { START_FEN, parseUci, toUci, type GameOutcome, type PlayedMove } from './game';
import type { Color, GameEndReason, Square } from './types';

/**
 * Secret Queen: a chess variant with hidden information.
 *
 * - Before their first move, each player secretly picks one of their pawns
 *   to be their secret queen (a random one if they don't). The choice is
 *   final: it cannot be changed afterwards.
 * - Until it is revealed the opponent sees an ordinary pawn. Its owner can move
 *   it like a pawn (it stays hidden) or like a queen (that reveals it: it
 *   becomes a visible queen).
 * - It is revealed as soon as it must be: when it gives check as a queen, or
 *   when the opponent tries a move that is illegal only because of it (their
 *   king stepping into its line, say). That move is refused and they move again.
 * - Captured while hidden, it is just a pawn. Promoting it ends the secret.
 *   Both secrets are shown when the game ends.
 *
 * The game keeps the public position (secrets drawn as pawns, revealed ones
 * as queens) plus the two secret squares. The full truth (secrets as queens)
 * decides king safety and the end of the game.
 */
export type GameVariant = 'standard' | 'secretQueen';
export const GAME_VARIANTS: readonly GameVariant[] = ['standard', 'secretQueen'];

export type RevealReason = 'moved' | 'check' | 'blocked' | 'captured' | 'end';

export interface SecretReveal {
  color: Color;
  square: Square;
  reason: RevealReason;
}

export type SecretSquares = Record<Color, Square | null>;

const FILES = 'abcdefgh';

/** Sets (or clears, with null) one square of a FEN's piece placement. */
export function fenWithPiece(fen: string, sq: Square, piece: string | null): string {
  const [placement, ...rest] = fen.split(' ');
  const rows = placement!.split('/').map((row) => {
    const cells: string[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push('');
      else cells.push(ch);
    }
    return cells;
  });
  const file = FILES.indexOf(sq[0]!);
  const rank = Number(sq[1]);
  rows[8 - rank]![file] = piece ?? '';
  const packed = rows
    .map((cells) => {
      let out = '';
      let empty = 0;
      for (const c of cells) {
        if (!c) empty++;
        else {
          if (empty) out += String(empty);
          empty = 0;
          out += c;
        }
      }
      return out + (empty ? String(empty) : '');
    })
    .join('/');
  return [packed, ...rest].join(' ');
}

const queenChar = (color: Color) => (color === 'w' ? 'Q' : 'q');

/** Queen lines from `from` reach `target` on this board (blockers stop them). */
export function queenAttacks(fen: string, from: Square, target: Square): boolean {
  const c = new Chess(fen);
  const fx = FILES.indexOf(from[0]!);
  const fy = Number(from[1]);
  const tx = FILES.indexOf(target[0]!);
  const ty = Number(target[1]);
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  if (dx === 0 && dy === 0) return false;
  if (dx !== 0 && dy !== 0 && Math.abs(tx - fx) !== Math.abs(ty - fy)) return false;
  let x = fx + dx;
  let y = fy + dy;
  while (x !== tx || y !== ty) {
    if (c.get(`${FILES[x]}${y}` as Square)) return false;
    x += dx;
    y += dy;
  }
  return true;
}

function kingSquare(c: Chess, color: Color): Square | null {
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square as Square;
  return null;
}

/** Position key for repetition: placement, side, castling and en passant of the true position. */
const repetitionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

interface Snapshot {
  fen: string;
  secrets: SecretSquares;
  historyLength: number;
}

interface Entry {
  move: PlayedMove;
  reveals: SecretReveal[];
}

/**
 * Server-side Secret Queen game: same shape as `Game` where the game room
 * needs it (fen, turn, ply, move, undo, history, outcome).
 */
export class SecretQueenGame {
  readonly startFen: string;
  private fenNow: string;
  private secrets: SecretSquares = { w: null, b: null };
  private entries: Entry[] = [];
  private undoStack: Snapshot[] = [];
  private seen = new Map<string, number>();
  /** Reveal caused by a refused move, picked up by the room (see takeRejectedReveal). */
  private rejectedReveal: SecretReveal | null = null;
  private readonly random: () => number;

  constructor(fen: string = START_FEN, random: () => number = Math.random) {
    this.startFen = new Chess(fen).fen();
    this.fenNow = this.startFen;
    this.random = random;
  }

  // ---------------------------------------------------------------- views

  /** Public position: what both players and spectators see. */
  get fen(): string {
    return this.fenNow;
  }

  get turn(): Color {
    return this.fenNow.split(' ')[1] === 'b' ? 'b' : 'w';
  }

  get ply(): number {
    return this.entries.length;
  }

  /** Full truth: both secrets drawn as queens. Never send this to a player. */
  truthFen(): string {
    let fen = this.fenNow;
    for (const color of ['w', 'b'] as const) {
      const sq = this.secrets[color];
      if (sq) fen = fenWithPiece(fen, sq, queenChar(color));
    }
    return fen;
  }

  /** Truth from `color`'s side: their own secret stays a pawn, the opponent's is a queen. */
  private semiTruthFen(color: Color): string {
    const opp: Color = color === 'w' ? 'b' : 'w';
    const sq = this.secrets[opp];
    return sq ? fenWithPiece(this.fenNow, sq, queenChar(opp)) : this.fenNow;
  }

  get inCheck(): boolean {
    return new Chess(this.truthFen()).inCheck();
  }

  secretOf(color: Color): Square | null {
    return this.secrets[color];
  }

  /** Both secrets (for the end of the game). */
  allSecrets(): SecretSquares {
    return { ...this.secrets };
  }

  history(): PlayedMove[] {
    return this.entries.map((e) => e.move);
  }

  reveals(): SecretReveal[] {
    return this.entries.flatMap((e) => e.reveals);
  }

  uciHistory(): string[] {
    return this.entries.map((e) => e.move.uci);
  }

  /** Moves this color has played. */
  private movesBy(color: Color): number {
    return this.entries.filter((e) => e.move.color === color).length;
  }

  // ---------------------------------------------------------------- picking

  /** Whether `color` still has to pick their secret pawn (once, before their first move). */
  canPick(color: Color): boolean {
    return this.movesBy(color) === 0 && !this.secrets[color];
  }

  /** Own pawns that can become the secret queen right now (empty once picked or after the first move). */
  pickable(color: Color): Square[] {
    if (!this.canPick(color)) return [];
    const out: Square[] = [];
    for (const row of new Chess(this.fenNow).board()) for (const p of row) if (p && p.type === 'p' && p.color === color) out.push(p.square as Square);
    return out;
  }

  /** Picks the secret pawn: an own pawn, once, before the player's first move. The choice is final. */
  pick(color: Color, sq: Square): boolean {
    if (!this.canPick(color)) return false;
    const p = new Chess(this.fenNow).get(sq);
    if (!p || p.type !== 'p' || p.color !== color) return false;
    this.secrets[color] = sq;
    return true;
  }

  /** Picks a random pawn for a player who did not choose. */
  autoPick(color: Color): Square | null {
    if (!this.canPick(color)) return this.secrets[color];
    const pawns: Square[] = [];
    for (const row of new Chess(this.fenNow).board()) for (const p of row) if (p && p.type === 'p' && p.color === color) pawns.push(p.square as Square);
    if (!pawns.length) return null;
    const sq = pawns[Math.floor(this.random() * pawns.length)]!;
    this.secrets[color] = sq;
    return sq;
  }

  // ---------------------------------------------------------------- moves

  /** Every legal move for the side to move, judged on the truth. */
  private legal(color: Color): { from: Square; to: Square; promotion?: string; asQueen: boolean }[] {
    const out: { from: Square; to: Square; promotion?: string; asQueen: boolean }[] = [];
    const semi = new Chess(this.semiTruthFen(color));
    if (semi.turn() !== color) return out;
    for (const m of semi.moves({ verbose: true })) out.push({ from: m.from as Square, to: m.to as Square, promotion: m.promotion, asQueen: false });
    const sec = this.secrets[color];
    if (sec) {
      const full = new Chess(this.truthFen());
      for (const m of full.moves({ square: sec, verbose: true })) {
        if (!out.some((x) => x.from === m.from && x.to === m.to)) out.push({ from: m.from as Square, to: m.to as Square, asQueen: true });
      }
    }
    return out;
  }

  /** Reveal caused by the last refused move, if any; reading clears it. */
  takeRejectedReveal(): SecretReveal | null {
    const r = this.rejectedReveal;
    this.rejectedReveal = null;
    return r;
  }

  private reveal(color: Color, reason: RevealReason): SecretReveal | null {
    const sq = this.secrets[color];
    if (!sq) return null;
    this.fenNow = fenWithPiece(this.fenNow, sq, queenChar(color));
    this.secrets[color] = null;
    return { color, square: sq, reason };
  }

  /** Plays a move for the side to move; null when illegal (see takeRejectedReveal). */
  move(uci: string): PlayedMove | null {
    let input;
    try {
      input = parseUci(uci);
    } catch {
      return null;
    }
    const color = this.turn;
    const opp: Color = color === 'w' ? 'b' : 'w';
    // Nobody may start without a secret: pick one for them.
    if (this.canPick(color)) this.autoPick(color);

    const legal = this.legal(color);
    const options = legal.filter((m) => m.from === input.from && m.to === input.to);
    if (!options.length) {
      // Legal as far as this player can see, illegal only because of the hidden queen: reveal it.
      const pub = new Chess(this.fenNow);
      const visible = pub.moves({ square: input.from, verbose: true }).some((m) => m.to === input.to);
      if (visible && this.secrets[opp]) this.rejectedReveal = this.reveal(opp, 'blocked');
      return null;
    }
    const pawnMove = options.find((m) => !m.asQueen && (!m.promotion || m.promotion === (input.promotion ?? 'q')));
    const queenMove = options.find((m) => m.asQueen);
    const chosen = pawnMove ?? queenMove;
    if (!chosen) return null;

    this.undoStack.push({ fen: this.fenNow, secrets: { ...this.secrets }, historyLength: this.entries.length });
    const reveals: SecretReveal[] = [];
    const ownSecret = this.secrets[color];
    if (chosen.asQueen) {
      const r = this.reveal(color, 'moved');
      if (r) reveals.push(r);
    }

    // Play it on the public board. That board knows less than the truth, so a truth-legal move is always accepted there.
    const pub = new Chess(this.fenNow);
    let played;
    try {
      played = pub.move({ from: input.from, to: input.to, promotion: chosen.promotion ? (input.promotion ?? 'q') : undefined });
    } catch {
      const snap = this.undoStack.pop()!;
      this.fenNow = snap.fen;
      this.secrets = snap.secrets;
      return null;
    }
    this.fenNow = pub.fen();

    // The secret travels with its pawn, or ends on promotion.
    if (ownSecret && !chosen.asQueen && input.from === ownSecret) this.secrets[color] = played.promotion ? null : input.to;
    // Capturing the opponent's hidden pawn takes the secret with it.
    const oppSecret = this.secrets[opp];
    if (oppSecret && played.captured) {
      const capturedSquare = played.flags.includes('e') ? (`${input.to[0]}${input.from[1]}` as Square) : input.to;
      if (capturedSquare === oppSecret) {
        reveals.push({ color: opp, square: oppSecret, reason: 'captured' });
        this.secrets[opp] = null;
      }
    }
    // A hidden queen that gives check must show itself.
    const mine = this.secrets[color];
    if (mine) {
      const king = kingSquare(new Chess(this.fenNow), opp);
      if (king && queenAttacks(this.fenNow, mine, king)) {
        const r = this.reveal(color, 'check');
        if (r) reveals.push(r);
      }
    }

    const truth = new Chess(this.truthFen());
    const isCheck = truth.inCheck();
    let san = played.san.replace(/[+#]$/, '');
    if (chosen.asQueen) san = `Q${san.replace(/^[KQRBNP]/, '')}`;
    if (isCheck) san += truth.isCheckmate() ? '#' : '+';
    const move: PlayedMove = {
      san,
      uci: toUci({ from: input.from, to: input.to, promotion: played.promotion }),
      from: input.from,
      to: input.to,
      color,
      piece: chosen.asQueen ? 'q' : played.piece,
      captured: played.captured,
      promotion: played.promotion,
      fenAfter: this.fenNow,
      isCheck,
    };
    this.entries.push({ move, reveals });
    const key = repetitionKey(this.truthFen());
    this.seen.set(key, (this.seen.get(key) ?? 0) + 1);
    return move;
  }

  /** Reveals made by the last move. */
  lastReveals(): SecretReveal[] {
    return this.entries[this.entries.length - 1]?.reveals ?? [];
  }

  undo(): PlayedMove | null {
    const snap = this.undoStack.pop();
    if (!snap) return null;
    const key = repetitionKey(this.truthFen());
    const n = this.seen.get(key) ?? 0;
    if (n <= 1) this.seen.delete(key);
    else this.seen.set(key, n - 1);
    const last = this.entries[this.entries.length - 1];
    this.fenNow = snap.fen;
    this.secrets = snap.secrets;
    this.entries.length = snap.historyLength;
    return last?.move ?? null;
  }

  // ---------------------------------------------------------------- end

  boardOutcome(): GameOutcome | null {
    const color = this.turn;
    const truth = new Chess(this.truthFen());
    if (this.legal(color).length === 0) {
      if (truth.inCheck()) {
        const winner: Color = color === 'w' ? 'b' : 'w';
        return { result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner };
      }
      return draw('stalemate');
    }
    if (truth.isInsufficientMaterial()) return draw('insufficient_material');
    if ((this.seen.get(repetitionKey(truth.fen())) ?? 0) >= 3) return draw('threefold_repetition');
    if (Number(this.fenNow.split(' ')[4]) >= 100) return draw('fifty_move_rule');
    return null;
  }

  hasMatingMaterial(color: Color): boolean {
    const pieces = new Chess(this.truthFen())
      .board()
      .flat()
      .filter((p): p is NonNullable<typeof p> => p !== null && p.color === color && p.type !== 'k');
    if (pieces.length === 0) return false;
    if (pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b')) return false;
    return true;
  }

  pgn(headers: Record<string, string> = {}): string {
    const head = Object.entries({ Variant: 'Secret Queen', ...headers })
      .map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`)
      .join('\n');
    const moves = this.entries.map((e, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${e.move.san}` : e.move.san)).join(' ');
    return `${head}\n\n${moves}`;
  }
}

function draw(reason: GameEndReason): GameOutcome {
  return { result: '1/2-1/2', reason, winner: null };
}

/**
 * Where the owner can move a piece in a Secret Queen game, from what they
 * know: their own secret moves as a pawn or a queen; everything else as in
 * the public position. The server has the final word (the opponent's secret).
 */
export function secretQueenTargets(fen: string, color: Color, from: Square, secret: Square | null): Square[] {
  try {
    const pub = new Chess(fen);
    if (pub.turn() !== color) return [];
    const targets = new Set<Square>(pub.moves({ square: from, verbose: true }).map((m) => m.to as Square));
    if (secret && from === secret) {
      const own = new Chess(fenWithPiece(fen, secret, queenChar(color)));
      for (const m of own.moves({ square: from, verbose: true })) targets.add(m.to as Square);
    }
    return [...targets];
  } catch {
    return [];
  }
}

/**
 * A Secret Queen move as clients show it, from the server's public record
 * (pawns may move like queens, so these games are never replayed with
 * standard rules).
 */
export function publicMove(p: { uci: string; san: string; fen: string }, fenBefore: string): PlayedMove {
  const color: Color = fenBefore.split(' ')[1] === 'b' ? 'b' : 'w';
  return {
    san: p.san,
    uci: p.uci,
    from: p.uci.slice(0, 2) as Square,
    to: p.uci.slice(2, 4) as Square,
    color,
    piece: '',
    promotion: p.uci[4],
    fenAfter: p.fen,
    isCheck: /[+#]$/.test(p.san),
  };
}

/** The whole public history of a Secret Queen game. */
export function publicHistory(positions: { uci: string; san: string; fen: string }[], initialFen: string): PlayedMove[] {
  const out: PlayedMove[] = [];
  let before = initialFen;
  for (const p of positions) {
    out.push(publicMove(p, before));
    before = p.fen;
  }
  return out;
}
