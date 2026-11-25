import { Game, toWhitePov, type Color, type Score } from '@chessmate/core';

import type { PositionEval } from './engine';

/** Shallowest search accepted for a position analysed on a moderator's device. */
export const MIN_DEVICE_DEPTH = 12;
/** Deepest depth we record (anything higher is a client typo, not a real search). */
export const MAX_DEVICE_DEPTH = 60;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Checks the per-position results a moderator's device sent against the stored
 * game, and returns them in the form the correlation maths expects.
 *
 * The device only ever sends raw engine output: one evaluation per position,
 * with a legal best move and a real search depth. The server walks the game
 * itself, scores terminal positions from the board rather than trusting them,
 * and computes every accuracy, match rate and z-score from these numbers with
 * the same code it uses for its own engine. Nothing graded can be sent
 * directly.
 *
 * This is deliberately not a trust boundary we lean on: it rejects malformed
 * and impossible results, not dishonest ones. Only staff accounts with
 * `fairplay.review` can post here, device reports are recorded as such, and
 * they never open a case on their own.
 */
export function evalsFromDevice(
  initialFen: string,
  moves: string[],
  raw: unknown,
): { evals: PositionEval[] } | { error: string } {
  if (!moves.length) return { error: 'This game has no moves to analyse' };
  if (!Array.isArray(raw) || raw.length !== moves.length + 1) return { error: 'Need one evaluation per position' };

  const g = new Game(initialFen);
  const evals: PositionEval[] = [];
  for (let i = 0; i <= moves.length; i++) {
    const side = g.turn;
    const end = g.boardOutcome();
    // Terminal positions are scored from the board, exactly as the server's own analyser does.
    if (end?.reason === 'checkmate') evals.push({ bestMove: null, score: { mate: end.winner === 'w' ? 1 : -1 } });
    else if (end) evals.push({ bestMove: null, score: { cp: 0 } });
    else {
      const ev = parseEval(g, side, raw[i]);
      if (!ev) return { error: `Invalid evaluation for position ${i}` };
      evals.push(ev);
    }
    const uci = moves[i];
    if (uci === undefined) break;
    if (!g.move(uci)) return { error: 'Invalid game' };
  }
  return { evals };
}

/**
 * One position as a device reports it: `{ score, bestMove }`, with the score
 * from the side to move the way a UCI engine prints it. It comes back flipped
 * to White's point of view, so device results and the server's own engine are
 * the same thing.
 */
function parseEval(g: Game, side: Color, v: unknown): PositionEval | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const score = parseScore(o.score);
  if (!score) return null;
  const best = o.bestMove;
  if (best !== null && best !== undefined) {
    if (typeof best !== 'string' || !UCI.test(best)) return null;
    // The best move has to be playable in this position.
    if (!new Game(g.fen).move(best)) return null;
  }
  return { bestMove: typeof best === 'string' ? best : null, score: toWhitePov(score, side) };
}

function parseScore(v: unknown): Score | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.mate === 'number') return Number.isInteger(o.mate) && Math.abs(o.mate) <= 500 ? { mate: o.mate } : null;
  if (typeof o.cp === 'number') return Number.isFinite(o.cp) && Math.abs(o.cp) <= 100_000 ? { cp: Math.round(o.cp) } : null;
  return null;
}

/** The search depth a device claims, or null when it is missing or out of range. */
export function parseDepth(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  return v >= MIN_DEVICE_DEPTH && v <= MAX_DEVICE_DEPTH ? v : null;
}
