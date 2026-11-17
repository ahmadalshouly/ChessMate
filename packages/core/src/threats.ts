import { Chess } from 'chess.js';
import { ALL_SQUARES, PIECE_VALUES, opposite, type Color, type PieceType, type Square } from './types';

export interface HangingPiece {
  square: Square;
  piece: PieceType;
  attackers: Square[];
  defenders: Square[];
  /** Material at risk in pawns, from a simple exchange estimate. */
  risk: number;
}

export type ThreatKind = 'mate' | 'check' | 'capture' | 'fork';

export interface Threat {
  kind: ThreatKind;
  /** Move in UCI that the opponent threatens to play. */
  uci: string;
  san: string;
  from: Square;
  to: Square;
  /** Squares of `perspective` pieces that this threat targets. */
  targets: Square[];
  /** Estimated material gain for the threatening side, in pawns. */
  gain: number;
  description: string;
}

export interface PositionInsight {
  perspective: Color;
  inCheck: boolean;
  hanging: HangingPiece[];
  threats: Threat[];
  /** Checks and favourable captures available to `perspective` right now. */
  opportunities: Threat[];
}

const NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function pieceName(t: PieceType): string {
  return NAMES[t];
}

/** Lists `color`'s pieces that can be won by the opponent. */
export function findHangingPieces(chess: Chess, color: Color): HangingPiece[] {
  const enemy = opposite(color);
  const out: HangingPiece[] = [];
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (!p || p.color !== color || p.type === 'k') continue;
    const attackers = chess.attackers(sq, enemy) as Square[];
    if (attackers.length === 0) continue;
    const defenders = chess.attackers(sq, color) as Square[];
    const value = PIECE_VALUES[p.type];
    const cheapest = Math.min(...attackers.map((a) => PIECE_VALUES[chess.get(a)!.type]));
    let risk = 0;
    if (defenders.length === 0) risk = value;
    else if (cheapest < value) risk = value - cheapest;
    if (risk > 0) out.push({ square: sq, piece: p.type, attackers, defenders, risk });
  }
  return out.sort((a, b) => b.risk - a.risk);
}

/**
 * Returns a copy of the position with the side to move flipped ("null move").
 * Returns null when the side to move is in check (null move is illegal).
 */
export function nullMove(chess: Chess): Chess | null {
  if (chess.inCheck()) return null;
  const parts = chess.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null;
  }
}

/** Tactical moves (mates, checks, winning captures, forks) for the side to move. */
export function tacticalMoves(chess: Chess): Threat[] {
  const mover = chess.turn();
  const victim = opposite(mover);
  const out: Threat[] = [];
  for (const m of chess.moves({ verbose: true })) {
    const after = new Chess(m.after);
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
    const base = { uci, san: m.san, from: m.from as Square, to: m.to as Square };
    if (after.isCheckmate()) {
      out.push({ ...base, kind: 'mate', targets: [kingSquare(after, victim)], gain: 1000, description: `checkmate with ${m.san}` });
      continue;
    }
    if (m.captured) {
      const capturedValue = PIECE_VALUES[m.captured as PieceType];
      const recapturable = after.attackers(m.to, victim).length > 0;
      const gain = recapturable ? capturedValue - PIECE_VALUES[m.piece as PieceType] : capturedValue;
      if (gain > 0) {
        out.push({
          ...base,
          kind: 'capture',
          targets: [m.to as Square],
          gain,
          description: `${m.san}, winning the ${NAMES[m.captured as PieceType]}`,
        });
        continue;
      }
    }
    // Fork: the moved piece (safe on its square) attacks two or more valuable enemy pieces.
    const safe = after.attackers(m.to, victim).length === 0;
    if (safe) {
      const attacked = forkTargets(after, m.to as Square, mover);
      if (attacked.length >= 2) {
        const gain = Math.min(...attacked.map((s) => PIECE_VALUES[after.get(s)!.type]).filter((v) => v < 100), 9);
        out.push({
          ...base,
          kind: 'fork',
          targets: attacked,
          gain,
          description: `${m.san}, forking ${attacked.map((s) => NAMES[after.get(s)!.type]).join(' and ')}`,
        });
        continue;
      }
    }
    if (after.inCheck()) {
      out.push({ ...base, kind: 'check', targets: [kingSquare(after, victim)], gain: 0, description: `check with ${m.san}` });
    }
  }
  const rank: Record<ThreatKind, number> = { mate: 0, capture: 1, fork: 1, check: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.gain - a.gain);
}

function forkTargets(chess: Chess, from: Square, mover: Color): Square[] {
  const victim = opposite(mover);
  const piece = chess.get(from);
  if (!piece) return [];
  const targets: Square[] = [];
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (!p || p.color !== victim) continue;
    if (!(chess.attackers(sq, mover) as Square[]).includes(from)) continue;
    const valuable = p.type === 'k' || PIECE_VALUES[p.type] > PIECE_VALUES[piece.type] || chess.attackers(sq, victim).length === 0;
    if (valuable && p.type !== 'p') targets.push(sq);
  }
  return targets;
}

function kingSquare(chess: Chess, color: Color): Square {
  for (const sq of ALL_SQUARES) {
    const p = chess.get(sq);
    if (p && p.type === 'k' && p.color === color) return sq;
  }
  throw new Error('No king on board');
}

/**
 * Explains a position from `perspective`'s point of view: what is hanging,
 * what the opponent threatens next, and what tactical chances exist.
 */
export function analyzePosition(fen: string, perspective: Color): PositionInsight {
  const chess = new Chess(fen);
  const hanging = findHangingPieces(chess, perspective);
  let threats: Threat[] = [];
  let opportunities: Threat[] = [];
  if (chess.turn() === perspective) {
    opportunities = tacticalMoves(chess);
    const flipped = nullMove(chess);
    threats = flipped ? tacticalMoves(flipped).filter((t) => t.kind !== 'check') : [];
  } else {
    threats = tacticalMoves(chess).filter((t) => t.kind !== 'check');
    const flipped = nullMove(chess);
    opportunities = flipped ? tacticalMoves(flipped) : [];
  }
  return { perspective, inCheck: chess.inCheck() && chess.turn() === perspective, hanging, threats, opportunities };
}
