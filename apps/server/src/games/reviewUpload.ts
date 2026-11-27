import { ANALYSIS_LIMITS, Game, buildReview, terminalScore, terminalState, type GameReview, type PositionEval, type Score } from '@chessmate/core';

/** Shallowest search accepted for a position in an uploaded review (the app searches depth 10, and 14 around moves that matter; 18 and 20 for a Deep review). */
export const MIN_UPLOAD_DEPTH = 8;
/**
 * The deepest search a standard review does (the app's depth 14 pass). An
 * upload that searched every position deeper than this is a Deep review,
 * which anyone signed in may save over a shallower one.
 */
export const STANDARD_REVIEW_DEPTH = 14;
/** Moves of each engine line kept from an upload. */
const MAX_PV = 12;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Turns the per-position engine results a player's device sent into a review
 * of the stored game. The server runs no engine: it checks the results are
 * well formed and fit the game (one per position, legal best moves, a real
 * search depth), then grades the moves itself from them with the same code
 * the app uses, so the accuracy and move classes cannot be sent directly.
 * `theoryPlies` is the server's own count of opening moves that are theory
 * (Dig Deep's masters games), the same the app asked the server for.
 */
export function reviewFromUpload(
  initialFen: string,
  moves: string[],
  raw: unknown,
  opts: { theoryPlies?: number } = {},
): { review: GameReview } | { error: string } {
  if (!moves.length) return { error: 'This game has no moves to review' };
  if (moves.length > ANALYSIS_LIMITS.maxReviewPlies) return { error: 'Game too long to review' };
  if (!Array.isArray(raw) || raw.length !== moves.length + 1) return { error: 'Need one evaluation per position' };
  let fens: string[];
  try {
    const g = new Game(initialFen);
    fens = [g.fen];
    for (const m of moves) {
      if (!g.move(m)) throw new Error('illegal');
      fens.push(g.fen);
    }
  } catch {
    return { error: 'Invalid game' };
  }
  const evals: PositionEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i]!;
    const term = terminalState(fen);
    if (term) {
      evals.push({ score: terminalScore(fen, term), pv: [], depth: 0 });
      continue;
    }
    const ev = parseEval(fen, raw[i]);
    if (!ev) return { error: `Invalid evaluation for position ${i}` };
    evals.push(ev);
  }
  try {
    return { review: buildReview(fens[0]!, moves, evals, null, { theoryPlies: opts.theoryPlies }) };
  } catch {
    return { error: 'Invalid evaluations' };
  }
}

/** The shallowest search depth in an upload (0 when there is none), to tell whether it can be deeper than a saved review before grading it. */
export function uploadDepth(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  let min = Infinity;
  for (const v of raw) {
    const d = v && typeof v === 'object' ? (v as Record<string, unknown>).depth : undefined;
    if (typeof d === 'number' && d > 0) min = Math.min(min, d);
  }
  return Number.isFinite(min) ? min : 0;
}

function parseEval(fen: string, v: unknown): PositionEval | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const score = parseScore(o.score);
  if (!score) return null;
  const depth = o.depth;
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < MIN_UPLOAD_DEPTH || depth > 99) return null;
  const pv = Array.isArray(o.pv) ? o.pv.slice(0, MAX_PV) : [];
  if (!pv.every((m) => typeof m === 'string' && UCI.test(m))) return null;
  const bestMove = typeof o.bestMove === 'string' ? o.bestMove : pv[0];
  if (typeof bestMove !== 'string' || !UCI.test(bestMove)) return null;
  // The best move has to be playable in this position.
  try {
    if (!new Game(fen).move(bestMove)) return null;
  } catch {
    return null;
  }
  const out: PositionEval = { score, bestMove, pv: pv as string[], depth };
  if (o.secondScore !== undefined) {
    const second = parseScore(o.secondScore);
    if (!second) return null;
    out.secondScore = second;
  }
  return out;
}

function parseScore(v: unknown): Score | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.mate === 'number') return Number.isInteger(o.mate) && Math.abs(o.mate) <= 500 ? { mate: o.mate } : null;
  if (typeof o.cp === 'number') return Number.isFinite(o.cp) && Math.abs(o.cp) <= 100_000 ? { cp: Math.round(o.cp) } : null;
  return null;
}
