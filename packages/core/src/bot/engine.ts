/**
 * ChessMate's own lightweight chess engine, written for this project (no
 * third-party engine code). It powers "Play vs computer" on device, so it
 * works offline and needs no server. It is deliberately modest: alpha-beta
 * search with quiescence, a transposition table and a hand-written
 * evaluation. Full-strength analysis stays with the server-side engine.
 *
 * Board: 0x88 mailbox, square = rank * 16 + file (a1 = 0, h8 = 119).
 */

// Pieces: 1..6 for white, 9..14 for black (type | 8).
const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;
const BLACK = 8;

const WHITE_SIDE = 0;
const BLACK_SIDE = 1;

// Move flags, packed above from/to/promo.
const F_CAPTURE = 1;
const F_EP = 2;
const F_CASTLE = 4;
const F_DOUBLE = 8;

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFFSETS = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_DIRS = [15, 17, -15, -17];
const ROOK_DIRS = [1, -1, 16, -16];

export const MATE_SCORE = 100_000;
const MATE_BOUND = MATE_SCORE - 1000;
const INF = 1_000_000;

const encode = (from: number, to: number, promo: number, flags: number) => from | (to << 7) | (promo << 14) | (flags << 18);
const mFrom = (m: number) => m & 127;
const mTo = (m: number) => (m >> 7) & 127;
const mPromo = (m: number) => (m >> 14) & 15;
const mFlags = (m: number) => (m >> 18) & 15;

const sqName = (sq: number) => String.fromCharCode(97 + (sq & 7)) + String((sq >> 4) + 1);
const sqFromName = (name: string) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
const PROMO_CHARS = ['', '', 'n', 'b', 'r', 'q'];

// ---------------------------------------------------------------- hashing

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

const rng = makeRng(0x9e3779b9);
const Z_PIECE_LO = new Uint32Array(16 * 128).map(() => rng());
const Z_PIECE_HI = new Uint32Array(16 * 128).map(() => rng());
const Z_SIDE_LO = rng();
const Z_SIDE_HI = rng();
const Z_CASTLE_LO = new Uint32Array(16).map(() => rng());
const Z_CASTLE_HI = new Uint32Array(16).map(() => rng());
const Z_EP_LO = new Uint32Array(8).map(() => rng());
const Z_EP_HI = new Uint32Array(8).map(() => rng());

// Castling rights: 1 = K, 2 = Q, 4 = k, 8 = q. Masks clear rights when a
// king or rook moves from, or something lands on, its home square.
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0] = 15 & ~2;
CASTLE_MASK[7] = 15 & ~1;
CASTLE_MASK[4] = 15 & ~3;
CASTLE_MASK[112] = 15 & ~8;
CASTLE_MASK[119] = 15 & ~4;
CASTLE_MASK[116] = 15 & ~12;

// ------------------------------------------------------------- evaluation

// Middlegame / endgame piece values in centipawns.
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
/** Simple values for move ordering and exchange checks. */
const ORDER_VALUE = [0, 100, 320, 330, 500, 900, 2000];

/**
 * Piece-square tables, generated from a few readable rules instead of
 * copied tables: centralise minor pieces, push pawns (especially central
 * ones), keep the king tucked away until the endgame.
 * Index: [piece][sq64] from white's point of view (sq64 = rank*8 + file).
 */
function buildTables() {
  const mg: Int16Array[] = [];
  const eg: Int16Array[] = [];
  for (let p = 0; p <= 6; p++) {
    mg.push(new Int16Array(64));
    eg.push(new Int16Array(64));
  }
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const i = r * 8 + f;
      // Distance from the centre, 0 (centre) .. 3 (edge).
      const df = Math.max(3 - f, f - 4);
      const dr = Math.max(3 - r, r - 4);
      const centre = 6 - (df + dr); // 0..6
      const edge = Math.min(f, 7 - f, r, 7 - r) === 0;

      // Pawns: advance, with central pawns preferred early.
      const centralFile = f === 3 || f === 4;
      const pawnMg = r === 0 || r === 7 ? 0 : (r - 1) * 6 + (centralFile ? (r >= 3 ? 14 : r === 2 ? 6 : -4) : 0) + (f === 0 || f === 7 ? -4 : 0);
      const pawnEg = r === 0 || r === 7 ? 0 : (r - 1) * (r - 1) * 4;
      mg[PAWN]![i] = pawnMg;
      eg[PAWN]![i] = pawnEg;

      mg[KNIGHT]![i] = centre * 8 - 20 - (edge ? 10 : 0) - (r === 0 ? 8 : 0);
      eg[KNIGHT]![i] = centre * 6 - 18;

      mg[BISHOP]![i] = centre * 4 - 8 - (edge ? 6 : 0) + (r === 1 && (f === 1 || f === 6) ? 8 : 0) - (r === 0 ? 6 : 0);
      eg[BISHOP]![i] = centre * 3 - 9;

      mg[ROOK]![i] = (r === 6 ? 18 : 0) + (f === 3 || f === 4 ? 6 : 0) - (f === 0 || f === 7 ? 3 : 0);
      eg[ROOK]![i] = r === 6 ? 10 : 0;

      mg[QUEEN]![i] = centre * 2 - 6 - (r === 0 && f !== 3 ? 2 : 0);
      eg[QUEEN]![i] = centre * 4 - 12;

      // King: corners and back rank in the middlegame, centre in the endgame.
      const shelter = r === 0 ? (f <= 2 || f >= 6 ? 24 : f === 4 ? 4 : 0) : r === 1 ? (f <= 2 || f >= 5 ? 0 : -10) : -20 - r * 6;
      mg[KING]![i] = shelter;
      eg[KING]![i] = centre * 8 - 24;
    }
  }
  return { mg, eg };
}
const PST = buildTables();

const sq64 = (sq: number) => (sq >> 4) * 8 + (sq & 7);
const flip64 = (i: number) => (7 - (i >> 3)) * 8 + (i & 7);

// --------------------------------------------------------------- position

interface Undo {
  move: number;
  captured: number;
  castling: number;
  ep: number;
  halfmove: number;
  hashLo: number;
  hashHi: number;
}

export class Position {
  board = new Uint8Array(128);
  side = WHITE_SIDE;
  castling = 0;
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings = [4, 116];
  hashLo = 0;
  hashHi = 0;
  private undos: Undo[] = [];
  /** Hash history (lo only is enough as a quick repetition filter, hi confirms). */
  private historyLo: number[] = [];
  private historyHi: number[] = [];

  constructor(fen: string) {
    this.load(fen);
  }

  load(fen: string) {
    const [placement, side, castle, ep, half, full] = fen.trim().split(/\s+/);
    this.board.fill(0);
    let rank = 7;
    let file = 0;
    for (const ch of placement ?? '') {
      if (ch === '/') {
        rank--;
        file = 0;
      } else if (ch >= '1' && ch <= '8') {
        file += Number(ch);
      } else {
        const lower = ch.toLowerCase();
        const type = 'pnbrqk'.indexOf(lower) + 1;
        const piece = type | (ch === lower ? BLACK : 0);
        const sq = rank * 16 + file;
        this.board[sq] = piece;
        if (type === KING) this.kings[ch === lower ? BLACK_SIDE : WHITE_SIDE] = sq;
        file++;
      }
    }
    this.side = side === 'b' ? BLACK_SIDE : WHITE_SIDE;
    this.castling = 0;
    if (castle && castle !== '-') {
      if (castle.includes('K')) this.castling |= 1;
      if (castle.includes('Q')) this.castling |= 2;
      if (castle.includes('k')) this.castling |= 4;
      if (castle.includes('q')) this.castling |= 8;
    }
    this.ep = ep && ep !== '-' ? sqFromName(ep) : -1;
    this.halfmove = Number(half ?? 0) || 0;
    this.fullmove = Number(full ?? 1) || 1;
    this.undos = [];
    this.computeHash();
    this.historyLo = [];
    this.historyHi = [];
  }

  private computeHash() {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = this.board[sq]!;
      if (p) {
        lo ^= Z_PIECE_LO[p * 128 + sq]!;
        hi ^= Z_PIECE_HI[p * 128 + sq]!;
      }
    }
    if (this.side === BLACK_SIDE) {
      lo ^= Z_SIDE_LO;
      hi ^= Z_SIDE_HI;
    }
    lo ^= Z_CASTLE_LO[this.castling]!;
    hi ^= Z_CASTLE_HI[this.castling]!;
    if (this.ep >= 0) {
      lo ^= Z_EP_LO[this.ep & 7]!;
      hi ^= Z_EP_HI[this.ep & 7]!;
    }
    this.hashLo = lo >>> 0;
    this.hashHi = hi >>> 0;
  }

  isAttacked(sq: number, bySide: number): boolean {
    const b = this.board;
    const colorBits = bySide === BLACK_SIDE ? BLACK : 0;
    // Pawns: a white pawn attacks up the board, so look one rank below.
    const pawn = PAWN | colorBits;
    if (bySide === WHITE_SIDE) {
      if (!((sq - 15) & 0x88) && b[sq - 15] === pawn) return true;
      if (!((sq - 17) & 0x88) && b[sq - 17] === pawn) return true;
    } else {
      if (!((sq + 15) & 0x88) && b[sq + 15] === pawn) return true;
      if (!((sq + 17) & 0x88) && b[sq + 17] === pawn) return true;
    }
    const knight = KNIGHT | colorBits;
    for (const o of KNIGHT_OFFSETS) {
      const t = sq + o;
      if (!(t & 0x88) && b[t] === knight) return true;
    }
    const king = KING | colorBits;
    for (const o of KING_OFFSETS) {
      const t = sq + o;
      if (!(t & 0x88) && b[t] === king) return true;
    }
    const bishop = BISHOP | colorBits;
    const rook = ROOK | colorBits;
    const queen = QUEEN | colorBits;
    for (const d of BISHOP_DIRS) {
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t]!;
        if (p) {
          if (p === bishop || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    for (const d of ROOK_DIRS) {
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t]!;
        if (p) {
          if (p === rook || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    return false;
  }

  inCheck(side = this.side): boolean {
    return this.isAttacked(this.kings[side]!, side ^ 1);
  }

  /** Pseudo-legal moves (may leave own king in check). */
  generate(out: number[], capturesOnly = false): number {
    out.length = 0;
    const b = this.board;
    const us = this.side;
    const usBits = us === BLACK_SIDE ? BLACK : 0;
    const forward = us === WHITE_SIDE ? 16 : -16;
    const startRank = us === WHITE_SIDE ? 1 : 6;
    const promoRank = us === WHITE_SIDE ? 7 : 0;

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = b[sq]!;
      if (!p || (p & BLACK) !== usBits) continue;
      const type = p & 7;

      if (type === PAWN) {
        const one = sq + forward;
        if (!(one & 0x88) && !b[one]) {
          if (one >> 4 === promoRank) {
            for (let pr = QUEEN; pr >= KNIGHT; pr--) out.push(encode(sq, one, pr, 0));
          } else if (!capturesOnly) {
            out.push(encode(sq, one, 0, 0));
            const two = one + forward;
            if (sq >> 4 === startRank && !b[two]) out.push(encode(sq, two, 0, F_DOUBLE));
          }
        }
        for (const side of [forward - 1, forward + 1]) {
          const t = sq + side;
          if (t & 0x88) continue;
          const target = b[t]!;
          if (target && (target & BLACK) !== usBits) {
            if (t >> 4 === promoRank) {
              for (let pr = QUEEN; pr >= KNIGHT; pr--) out.push(encode(sq, t, pr, F_CAPTURE));
            } else out.push(encode(sq, t, 0, F_CAPTURE));
          } else if (t === this.ep) {
            out.push(encode(sq, t, 0, F_CAPTURE | F_EP));
          }
        }
        continue;
      }

      if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (const o of offsets) {
          const t = sq + o;
          if (t & 0x88) continue;
          const target = b[t]!;
          if (!target) {
            if (!capturesOnly) out.push(encode(sq, t, 0, 0));
          } else if ((target & BLACK) !== usBits) out.push(encode(sq, t, 0, F_CAPTURE));
        }
        if (type === KING && !capturesOnly) this.genCastles(out, sq);
        continue;
      }

      const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_OFFSETS;
      for (const d of dirs) {
        let t = sq + d;
        while (!(t & 0x88)) {
          const target = b[t]!;
          if (!target) {
            if (!capturesOnly) out.push(encode(sq, t, 0, 0));
          } else {
            if ((target & BLACK) !== usBits) out.push(encode(sq, t, 0, F_CAPTURE));
            break;
          }
          t += d;
        }
      }
    }
    return out.length;
  }

  private genCastles(out: number[], kingSq: number) {
    const b = this.board;
    const them = this.side ^ 1;
    if (this.side === WHITE_SIDE) {
      if (kingSq !== 4) return;
      if (this.castling & 1 && b[7] === ROOK && !b[5] && !b[6] && !this.isAttacked(4, them) && !this.isAttacked(5, them) && !this.isAttacked(6, them))
        out.push(encode(4, 6, 0, F_CASTLE));
      if (this.castling & 2 && b[0] === ROOK && !b[3] && !b[2] && !b[1] && !this.isAttacked(4, them) && !this.isAttacked(3, them) && !this.isAttacked(2, them))
        out.push(encode(4, 2, 0, F_CASTLE));
    } else {
      if (kingSq !== 116) return;
      if (this.castling & 4 && b[119] === (ROOK | BLACK) && !b[117] && !b[118] && !this.isAttacked(116, them) && !this.isAttacked(117, them) && !this.isAttacked(118, them))
        out.push(encode(116, 118, 0, F_CASTLE));
      if (this.castling & 8 && b[112] === (ROOK | BLACK) && !b[115] && !b[114] && !b[113] && !this.isAttacked(116, them) && !this.isAttacked(115, them) && !this.isAttacked(114, them))
        out.push(encode(116, 114, 0, F_CASTLE));
    }
  }

  private put(sq: number, piece: number) {
    this.board[sq] = piece;
    this.hashLo ^= Z_PIECE_LO[piece * 128 + sq]!;
    this.hashHi ^= Z_PIECE_HI[piece * 128 + sq]!;
  }

  private remove(sq: number) {
    const piece = this.board[sq]!;
    this.board[sq] = 0;
    this.hashLo ^= Z_PIECE_LO[piece * 128 + sq]!;
    this.hashHi ^= Z_PIECE_HI[piece * 128 + sq]!;
    return piece;
  }

  /** Makes a pseudo-legal move. Returns false (and undoes it) if illegal. */
  make(move: number): boolean {
    const from = mFrom(move);
    const to = mTo(move);
    const flags = mFlags(move);
    const promo = mPromo(move);
    const us = this.side;
    const usBits = us === BLACK_SIDE ? BLACK : 0;

    this.historyLo.push(this.hashLo);
    this.historyHi.push(this.hashHi);
    const undo: Undo = { move, captured: 0, castling: this.castling, ep: this.ep, halfmove: this.halfmove, hashLo: this.hashLo, hashHi: this.hashHi };

    // Clear old ep and castling from the hash.
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]!;
      this.hashHi ^= Z_EP_HI[this.ep & 7]!;
    }
    this.hashLo ^= Z_CASTLE_LO[this.castling]!;
    this.hashHi ^= Z_CASTLE_HI[this.castling]!;

    const piece = this.remove(from);
    if (flags & F_EP) {
      undo.captured = this.remove(to - (us === WHITE_SIDE ? 16 : -16));
    } else if (this.board[to]) {
      undo.captured = this.remove(to);
    }
    this.put(to, promo ? promo | usBits : piece);

    if (flags & F_CASTLE) {
      if (to === from + 2) this.put(from + 1, this.remove(from + 3));
      else this.put(from - 1, this.remove(from - 4));
    }
    if ((piece & 7) === KING) this.kings[us] = to;

    this.castling &= CASTLE_MASK[from]! & CASTLE_MASK[to]!;
    this.hashLo ^= Z_CASTLE_LO[this.castling]!;
    this.hashHi ^= Z_CASTLE_HI[this.castling]!;

    this.ep = flags & F_DOUBLE ? (from + to) >> 1 : -1;
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]!;
      this.hashHi ^= Z_EP_HI[this.ep & 7]!;
    }
    this.halfmove = (piece & 7) === PAWN || undo.captured ? 0 : this.halfmove + 1;
    if (us === BLACK_SIDE) this.fullmove++;
    this.side ^= 1;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
    this.hashLo >>>= 0;
    this.hashHi >>>= 0;
    this.undos.push(undo);

    if (this.isAttacked(this.kings[us]!, us ^ 1)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake() {
    const undo = this.undos.pop();
    if (!undo) return;
    this.historyLo.pop();
    this.historyHi.pop();
    this.side ^= 1;
    const us = this.side;
    const usBits = us === BLACK_SIDE ? BLACK : 0;
    const move = undo.move;
    const from = mFrom(move);
    const to = mTo(move);
    const flags = mFlags(move);
    const b = this.board;

    const moved = mPromo(move) ? PAWN | usBits : b[to]!;
    b[to] = 0;
    b[from] = moved;
    if (flags & F_EP) b[to - (us === WHITE_SIDE ? 16 : -16)] = undo.captured;
    else if (undo.captured) b[to] = undo.captured;
    if (flags & F_CASTLE) {
      if (to === from + 2) {
        b[from + 3] = b[from + 1]!;
        b[from + 1] = 0;
      } else {
        b[from - 4] = b[from - 1]!;
        b[from - 1] = 0;
      }
    }
    if ((moved & 7) === KING) this.kings[us] = from;
    if (us === BLACK_SIDE) this.fullmove--;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
  }

  makeNull() {
    this.historyLo.push(this.hashLo);
    this.historyHi.push(this.hashHi);
    this.undos.push({ move: 0, captured: 0, castling: this.castling, ep: this.ep, halfmove: this.halfmove, hashLo: this.hashLo, hashHi: this.hashHi });
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]!;
      this.hashHi ^= Z_EP_HI[this.ep & 7]!;
    }
    this.ep = -1;
    this.side ^= 1;
    this.hashLo = (this.hashLo ^ Z_SIDE_LO) >>> 0;
    this.hashHi = (this.hashHi ^ Z_SIDE_HI) >>> 0;
    this.halfmove++;
  }

  unmakeNull() {
    const undo = this.undos.pop()!;
    this.historyLo.pop();
    this.historyHi.pop();
    this.side ^= 1;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
  }

  /** True if the current position occurred before within the reversible window. */
  isRepetition(): boolean {
    const n = this.historyLo.length;
    const limit = Math.max(0, n - this.halfmove);
    for (let i = n - 2; i >= limit; i -= 2) {
      if (this.historyLo[i] === this.hashLo && this.historyHi[i] === this.hashHi) return true;
    }
    return false;
  }

  /** Commits a move permanently (game history), keeping hashes for repetition. */
  playUci(uci: string): boolean {
    const m = this.findUci(uci);
    if (!m) return false;
    return this.make(m);
  }

  findUci(uci: string): number {
    const from = sqFromName(uci.slice(0, 2));
    const to = sqFromName(uci.slice(2, 4));
    const promoChar = uci[4];
    const moves: number[] = [];
    this.generate(moves);
    for (const m of moves) {
      if (mFrom(m) !== from || mTo(m) !== to) continue;
      const pr = mPromo(m);
      if (pr && PROMO_CHARS[pr] !== (promoChar ?? 'q')) continue;
      return m;
    }
    return 0;
  }

  legalMoves(): number[] {
    const out: number[] = [];
    const pseudo: number[] = [];
    this.generate(pseudo);
    for (const m of pseudo) {
      if (this.make(m)) {
        out.push(m);
        this.unmake();
      }
    }
    return out;
  }

  /** Static evaluation from the side to move's point of view, in centipawns. */
  evaluate(): number {
    const b = this.board;
    let mg = 0;
    let eg = 0;
    let phase = 0;
    let bishopsW = 0;
    let bishopsB = 0;
    const pawnFilesW = new Uint8Array(8);
    const pawnFilesB = new Uint8Array(8);
    // Most advanced / least advanced pawn rank per file, for passed pawns.
    const maxW = new Int8Array(8).fill(-1);
    const minB = new Int8Array(8).fill(8);
    const minW = new Int8Array(8).fill(8);
    const maxB = new Int8Array(8).fill(-1);

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = b[sq]!;
      if (!p) continue;
      const type = p & 7;
      const white = !(p & BLACK);
      // Tables use rank 0 = the piece owner's back rank.
      const tIdx = white ? sq64(sq) : flip64(sq64(sq));
      const vMg = MG_VALUE[type]! + PST.mg[type]![tIdx]!;
      const vEg = EG_VALUE[type]! + PST.eg[type]![tIdx]!;
      phase += PHASE_WEIGHT[type]!;
      const file = sq & 7;
      const rank = sq >> 4;
      if (white) {
        mg += vMg;
        eg += vEg;
        if (type === BISHOP) bishopsW++;
        if (type === PAWN) {
          pawnFilesW[file]!++;
          if (rank > maxW[file]!) maxW[file] = rank;
          if (rank < minW[file]!) minW[file] = rank;
        }
      } else {
        mg -= vMg;
        eg -= vEg;
        if (type === BISHOP) bishopsB++;
        if (type === PAWN) {
          pawnFilesB[file]!++;
          if (rank < minB[file]!) minB[file] = rank;
          if (rank > maxB[file]!) maxB[file] = rank;
        }
      }
    }

    // Bishop pair.
    if (bishopsW >= 2) {
      mg += 30;
      eg += 45;
    }
    if (bishopsB >= 2) {
      mg -= 30;
      eg -= 45;
    }

    // Pawn structure: doubled, isolated, passed.
    for (let f = 0; f < 8; f++) {
      const wN = pawnFilesW[f]!;
      const bN = pawnFilesB[f]!;
      if (wN > 1) {
        mg -= 12 * (wN - 1);
        eg -= 20 * (wN - 1);
      }
      if (bN > 1) {
        mg += 12 * (bN - 1);
        eg += 20 * (bN - 1);
      }
      const wIso = wN && !(f > 0 && pawnFilesW[f - 1]) && !(f < 7 && pawnFilesW[f + 1]);
      const bIso = bN && !(f > 0 && pawnFilesB[f - 1]) && !(f < 7 && pawnFilesB[f + 1]);
      if (wIso) {
        mg -= 10;
        eg -= 14;
      }
      if (bIso) {
        mg += 10;
        eg += 14;
      }
      // White passed pawn: no black pawn ahead on this or adjacent files.
      if (wN) {
        const r = maxW[f]!;
        let passed = true;
        for (let af = Math.max(0, f - 1); af <= Math.min(7, f + 1) && passed; af++) if (maxB[af]! > r) passed = false;
        if (passed) {
          mg += 5 + r * 4;
          eg += 10 + r * r * 3;
        }
      }
      if (bN) {
        const r = minB[f]!;
        let passed = true;
        for (let af = Math.max(0, f - 1); af <= Math.min(7, f + 1) && passed; af++) if (minW[af]! < 8 && minW[af]! < r) passed = false;
        if (passed) {
          const adv = 7 - r;
          mg -= 5 + adv * 4;
          eg -= 10 + adv * adv * 3;
        }
      }
      // Rooks on open / half-open files.
      for (let r = 0; r < 8; r++) {
        const p = b[r * 16 + f];
        if (p === ROOK) {
          if (!wN) mg += bN ? 10 : 20;
        } else if (p === (ROOK | BLACK)) {
          if (!bN) mg -= wN ? 10 : 20;
        }
      }
    }

    const ph = Math.min(phase, 24);
    let score = Math.round((mg * ph + eg * (24 - ph)) / 24);

    // Mop-up: in won endgames, drive the enemy king to the edge.
    if (ph <= 6 && Math.abs(score) > 300) {
      const strong = score > 0 ? WHITE_SIDE : BLACK_SIDE;
      const weakK = this.kings[strong ^ 1]!;
      const strongK = this.kings[strong]!;
      const wf = weakK & 7;
      const wr = weakK >> 4;
      const centreDist = Math.max(3 - wf, wf - 4) + Math.max(3 - wr, wr - 4);
      const kingDist = Math.abs((strongK & 7) - wf) + Math.abs((strongK >> 4) - wr);
      const bonus = centreDist * 10 + (14 - kingDist) * 4;
      score += strong === WHITE_SIDE ? bonus : -bonus;
    }

    // Tempo.
    score += this.side === WHITE_SIDE ? 10 : -10;
    return this.side === WHITE_SIDE ? score : -score;
  }

  hasNonPawnMaterial(side: number): boolean {
    const bits = side === BLACK_SIDE ? BLACK : 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = this.board[sq]!;
      if (p && (p & BLACK) === bits && (p & 7) !== PAWN && (p & 7) !== KING) return true;
    }
    return false;
  }

  pieceAt(sq: number) {
    return this.board[sq]!;
  }

  undosLength(): number {
    return this.undos.length;
  }
}

export function moveToUci(m: number): string {
  return sqName(mFrom(m)) + sqName(mTo(m)) + PROMO_CHARS[mPromo(m)];
}

/** Counts leaf nodes; used by tests to verify move generation. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves: number[] = [];
  pos.generate(moves);
  let n = 0;
  for (const m of moves) {
    if (!pos.make(m)) continue;
    n += perft(pos, depth - 1);
    pos.unmake();
  }
  return n;
}

// ----------------------------------------------------------------- search

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;
const MAX_PLY = 64;

class Aborted extends Error {}

export interface SearchOptions {
  /** Maximum depth in plies (iterative deepening stops there). */
  maxDepth: number;
  /** Soft time budget in ms; the search stops after the current iteration overruns it. */
  timeMs?: number;
  /** Hard node cap, keeps weak levels fast and predictable. */
  maxNodes?: number;
}

export interface SearchResult {
  best: string;
  /** Score in centipawns from the side to move's point of view. */
  score: number;
  depth: number;
  nodes: number;
  /** Mate distance in moves when a forced mate is found (positive = side to move mates). */
  mateIn?: number;
}

export class Searcher {
  nodes = 0;
  private ttLo = new Uint32Array(TT_SIZE);
  private ttHi = new Uint32Array(TT_SIZE);
  private ttMove = new Int32Array(TT_SIZE);
  private ttScore = new Int32Array(TT_SIZE);
  private ttDepth = new Int8Array(TT_SIZE);
  private ttFlag = new Uint8Array(TT_SIZE);
  private killers = new Int32Array(MAX_PLY * 2);
  private historyTable = new Int32Array(16 * 128);
  private deadline = Infinity;
  private nodeLimit = Infinity;
  private moveBuffers: number[][] = Array.from({ length: MAX_PLY + 8 }, () => []);
  private scoreBuffers: number[][] = Array.from({ length: MAX_PLY + 8 }, () => []);

  constructor(private pos: Position) {}

  private checkLimits() {
    if ((this.nodes & 1023) === 0 && (Date.now() > this.deadline || this.nodes > this.nodeLimit)) throw new Aborted();
  }

  private orderMoves(moves: number[], scores: number[], ply: number, ttMove: number) {
    scores.length = moves.length;
    const b = this.pos.board;
    const k1 = this.killers[ply * 2];
    const k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]!;
      let s: number;
      if (m === ttMove) s = 10_000_000;
      else if (mFlags(m) & F_CAPTURE) {
        const victim = mFlags(m) & F_EP ? PAWN : b[mTo(m)]! & 7;
        const attacker = b[mFrom(m)]! & 7;
        s = 1_000_000 + ORDER_VALUE[victim]! * 10 - ORDER_VALUE[attacker]! / 10;
      } else if (mPromo(m) === QUEEN) s = 900_000;
      else if (m === k1) s = 800_000;
      else if (m === k2) s = 790_000;
      else s = this.historyTable[b[mFrom(m)]! * 128 + mTo(m)]!;
      scores[i] = s;
    }
  }

  private pick(moves: number[], scores: number[], start: number) {
    let best = start;
    for (let i = start + 1; i < moves.length; i++) if (scores[i]! > scores[best]!) best = i;
    if (best !== start) {
      const tm = moves[start]!;
      moves[start] = moves[best]!;
      moves[best] = tm;
      const ts = scores[start]!;
      scores[start] = scores[best]!;
      scores[best] = ts;
    }
    return moves[start]!;
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes++;
    this.checkLimits();
    const pos = this.pos;
    const stand = pos.evaluate();
    if (ply >= MAX_PLY) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;

    const moves = this.moveBuffers[ply]!;
    const scores = this.scoreBuffers[ply]!;
    pos.generate(moves, true);
    this.orderMoves(moves, scores, ply, 0);
    for (let i = 0; i < moves.length; i++) {
      const m = this.pick(moves, scores, i);
      // Delta pruning: skip captures that cannot raise alpha.
      if (!mPromo(m)) {
        const victim = mFlags(m) & F_EP ? PAWN : pos.board[mTo(m)]! & 7;
        if (stand + ORDER_VALUE[victim]! + 200 < alpha) continue;
      }
      if (!pos.make(m)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private search(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const pos = this.pos;
    if (ply > 0 && (pos.halfmove >= 100 || pos.isRepetition())) return 0;
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0 || ply >= MAX_PLY) return this.quiesce(alpha, beta, ply);

    this.nodes++;
    this.checkLimits();

    // Mate distance pruning.
    alpha = Math.max(alpha, -MATE_SCORE + ply);
    beta = Math.min(beta, MATE_SCORE - ply - 1);
    if (alpha >= beta) return alpha;

    const idx = pos.hashLo & TT_MASK;
    let ttMove = 0;
    if (this.ttLo[idx] === pos.hashLo && this.ttHi[idx] === pos.hashHi) {
      ttMove = this.ttMove[idx]!;
      if (ply > 0 && this.ttDepth[idx]! >= depth) {
        let s = this.ttScore[idx]!;
        if (s > MATE_BOUND) s -= ply;
        else if (s < -MATE_BOUND) s += ply;
        const flag = this.ttFlag[idx];
        if (flag === TT_EXACT) return s;
        if (flag === TT_LOWER && s >= beta) return s;
        if (flag === TT_UPPER && s <= alpha) return s;
      }
    }

    const pvNode = beta - alpha > 1;
    // Null-move pruning.
    if (allowNull && !pvNode && !inCheck && depth >= 3 && pos.hasNonPawnMaterial(pos.side) && pos.evaluate() >= beta) {
      pos.makeNull();
      const s = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (s >= beta) return beta;
    }

    const moves = this.moveBuffers[ply]!;
    const scores = this.scoreBuffers[ply]!;
    pos.generate(moves);
    this.orderMoves(moves, scores, ply, ttMove);
    const origAlpha = alpha;
    let bestScore = -INF;
    let bestMove = 0;
    let legal = 0;

    for (let i = 0; i < moves.length; i++) {
      const m = this.pick(moves, scores, i);
      if (!pos.make(m)) continue;
      legal++;
      const quiet = !(mFlags(m) & F_CAPTURE) && !mPromo(m);
      let score: number;
      if (legal === 1) {
        score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // Late move reductions for quiet moves, then PVS re-search.
        let reduction = 0;
        if (quiet && depth >= 3 && legal > 3 && !inCheck && !pos.inCheck()) reduction = legal > 8 ? 2 : 1;
        score = -this.search(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction) score = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2]!;
                this.killers[ply * 2] = m;
              }
              const hIdx = pos.board[mFrom(m)]! * 128 + mTo(m);
              this.historyTable[hIdx] = this.historyTable[hIdx]! + depth * depth;
            }
            break;
          }
        }
      }
    }

    if (legal === 0) return inCheck ? -MATE_SCORE + ply : 0;

    let stored = bestScore;
    if (stored > MATE_BOUND) stored += ply;
    else if (stored < -MATE_BOUND) stored -= ply;
    this.ttLo[idx] = pos.hashLo;
    this.ttHi[idx] = pos.hashHi;
    this.ttMove[idx] = bestMove;
    this.ttScore[idx] = stored;
    this.ttDepth[idx] = depth;
    this.ttFlag[idx] = bestScore >= beta ? TT_LOWER : bestScore > origAlpha ? TT_EXACT : TT_UPPER;
    return bestScore;
  }

  /** Iterative deepening search for the best move. */
  run(opts: SearchOptions): SearchResult {
    const pos = this.pos;
    const root = pos.legalMoves();
    if (root.length === 0) throw new Error('No legal moves');
    this.nodes = 0;
    this.deadline = opts.timeMs ? Date.now() + opts.timeMs : Infinity;
    this.nodeLimit = opts.maxNodes ?? Infinity;
    this.killers.fill(0);
    this.historyTable.fill(0);

    let best = root[0]!;
    let bestScore = 0;
    let completed = 0;
    const start = Date.now();
    for (let depth = 1; depth <= opts.maxDepth; depth++) {
      try {
        const score = this.search(depth, -INF, INF, 0, false);
        const idx = pos.hashLo & TT_MASK;
        if (this.ttLo[idx] === pos.hashLo && this.ttHi[idx] === pos.hashHi && this.ttMove[idx]) best = this.ttMove[idx]!;
        bestScore = score;
        completed = depth;
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
        // Unwind any moves the aborted search left on the board.
        while (pos.undosLength() > this.rootUndos) pos.unmake();
        break;
      }
      if (Math.abs(bestScore) > MATE_BOUND) break;
      // Don't start an iteration we are unlikely to finish.
      if (opts.timeMs && Date.now() - start > opts.timeMs * 0.55) break;
      if (root.length === 1 && depth >= 2) break;
    }
    const result: SearchResult = { best: moveToUci(best), score: bestScore, depth: completed, nodes: this.nodes };
    if (Math.abs(bestScore) > MATE_BOUND) {
      const plies = MATE_SCORE - Math.abs(bestScore);
      result.mateIn = Math.sign(bestScore) * Math.ceil(plies / 2);
    }
    return result;
  }

  /**
   * Scores every root move with a full window at `depth` (for weaker
   * levels that pick among good-enough moves). Scores are from the side to
   * move's point of view.
   */
  scoreRootMoves(depth: number, opts: { timeMs?: number; maxNodes?: number } = {}): { uci: string; score: number }[] {
    const pos = this.pos;
    const root = pos.legalMoves();
    this.nodes = 0;
    this.deadline = opts.timeMs ? Date.now() + opts.timeMs : Infinity;
    this.nodeLimit = opts.maxNodes ?? Infinity;
    const out: { uci: string; score: number }[] = [];
    for (const m of root) {
      pos.make(m);
      let score: number;
      try {
        score = depth <= 1 ? -this.quiesce(-INF, INF, 1) : -this.search(depth - 1, -INF, INF, 1, true);
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
        while (pos.undosLength() > this.rootUndos) pos.unmake();
        // Out of budget: unscored moves stay selectable with a pessimistic score.
        for (const rest of root.slice(out.length)) out.push({ uci: moveToUci(rest), score: -INF / 2 });
        return out;
      }
      pos.unmake();
      out.push({ uci: moveToUci(m), score });
    }
    return out;
  }

  rootUndos = 0;
}

/** Builds a position from a start FEN plus the game's UCI moves (keeps repetition history). */
export function positionFromMoves(startFen: string, moves: string[]): Position {
  const pos = new Position(startFen);
  for (const m of moves) {
    if (!pos.playUci(m)) throw new Error(`Illegal move ${m}`);
  }
  return pos;
}

/** Creates a searcher rooted at the position's current state. */
export function createSearcher(pos: Position): Searcher {
  const s = new Searcher(pos);
  s.rootUndos = pos.undosLength();
  return s;
}
