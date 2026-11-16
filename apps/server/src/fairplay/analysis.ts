import { Game, gameAccuracy, judgeMove, type Color, type Score } from '@chessmate/core';
import type { Analyzer, PositionEval } from './engine';

/**
 * Engine-correlation analysis. For each side we measure how closely the
 * moves track the engine (accuracy, top-move match rate, centipawn loss)
 * and how mechanical the move times look, then compare against what is
 * normal for the player's rating.
 *
 * None of these signals proves cheating. They rank accounts for a human
 * reviewer; nothing here bans anyone automatically.
 */

export interface FairPlayThresholds {
  /** Plies at the start of the game skipped as opening theory. */
  openingPlies: number;
  /** Positions already this decided (centipawns, mover's view) are skipped. */
  decidedCp: number;
  /** Fewest considered moves for a side's game to count at all. */
  minMovesPerGame: number;
  /** Fewest considered moves across the window before a pooled flag can fire. */
  minPooledMoves: number;
  /** Pooled accuracy z-score that triggers an engine-correlation flag... */
  accuracyZ: number;
  /** ...together with this pooled top-move match z-score. */
  matchZ: number;
  /** Single-game flag: accuracy z and match rate both extreme. */
  singleGameAccuracyZ: number;
  singleGameMatchRate: number;
  /** Move-time coefficient of variation below this looks machine-timed. */
  mechanicalTimingCv: number;
  /** Games with mechanical timing needed (plus elevated accuracy) to flag. */
  mechanicalTimingGames: number;
  /** Suspicion score (0..100) at which an account is put in the review queue. */
  queueScore: number;
  /** Recent analysed games considered per player. */
  window: number;
}

export const DEFAULT_THRESHOLDS: FairPlayThresholds = {
  openingPlies: 16,
  decidedCp: 400,
  minMovesPerGame: 10,
  minPooledMoves: 60,
  accuracyZ: 3,
  matchZ: 2.5,
  singleGameAccuracyZ: 4,
  singleGameMatchRate: 0.9,
  mechanicalTimingCv: 0.25,
  mechanicalTimingGames: 3,
  queueScore: 50,
  window: 20,
};

/** Spread of a single move's accuracy around the expected value; pooled sd = PER_MOVE_SD / sqrt(moves). */
const PER_MOVE_SD = 40;

const ACCURACY_CURVE: [number, number][] = [
  [600, 52],
  [1000, 60],
  [1400, 69],
  [1800, 77],
  [2200, 84],
  [2600, 89],
  [3000, 93],
];
const MATCH_CURVE: [number, number][] = [
  [600, 0.22],
  [1200, 0.32],
  [1800, 0.42],
  [2400, 0.52],
  [3000, 0.62],
];

function interp(curve: [number, number][], x: number): number {
  if (x <= curve[0]![0]) return curve[0]![1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]!;
    const [x0, y0] = curve[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return curve[curve.length - 1]![1];
}

/** Typical game accuracy (0..100) for a rating, for non-decided middlegame positions. */
export const expectedAccuracy = (rating: number) => interp(ACCURACY_CURVE, rating);
/** Typical rate of playing the engine's top move. */
export const expectedMatchRate = (rating: number) => interp(MATCH_CURVE, rating);

export interface GameForAnalysis {
  gameId: string;
  initialFen: string;
  moves: string[];
  /** Think time per ply in ms, aligned with `moves`. */
  thinkMs: number[];
  white: { id: string; rating: number };
  black: { id: string; rating: number };
  endedAt: number;
}

/** Per-side result of analysing one game. */
export interface SideReport {
  gameId: string;
  playerId: string;
  color: Color;
  rating: number;
  /** Non-trivial moves measured. */
  moves: number;
  accuracy: number;
  expectedAccuracy: number;
  accuracyZ: number;
  topMatches: number;
  matchRate: number;
  expectedMatchRate: number;
  /** Average centipawn loss over measured moves. */
  acpl: number;
  meanThinkMs: number;
  /** Coefficient of variation of think times; low = suspiciously regular. */
  thinkCv: number;
  analyzedAt: number;
}

const cpOf = (s: Score) => (s.mate !== undefined ? (s.mate > 0 ? 1000 : s.mate < 0 ? -1000 : 0) : Math.max(-1000, Math.min(1000, s.cp)));

/** Evaluates every position of the game with the analyzer. Terminal positions are scored from the board. */
export async function evaluateGame(game: GameForAnalysis, analyzer: Analyzer): Promise<PositionEval[]> {
  const g = new Game(game.initialFen);
  const evals: PositionEval[] = [];
  const evalHere = async (): Promise<PositionEval> => {
    const end = g.boardOutcome();
    if (end?.reason === 'checkmate') return { bestMove: null, score: { mate: end.winner === 'w' ? 1 : -1 } };
    if (end) return { bestMove: null, score: { cp: 0 } };
    return analyzer.analyze(g.fen);
  };
  evals.push(await evalHere());
  for (const m of game.moves) {
    if (!g.move(m)) throw new Error(`Illegal move in stored game ${game.gameId}: ${m}`);
    evals.push(await evalHere());
  }
  return evals;
}

/** Turns per-position evaluations into a report for each side. Pure. */
export function reportsFromEvals(
  game: GameForAnalysis,
  evals: PositionEval[],
  t: FairPlayThresholds = DEFAULT_THRESHOLDS,
  now = Date.now(),
): SideReport[] {
  const g = new Game(game.initialFen);
  const acc: Record<Color, { accs: number[]; matches: number; loss: number; times: number[] }> = {
    w: { accs: [], matches: 0, loss: 0, times: [] },
    b: { accs: [], matches: 0, loss: 0, times: [] },
  };
  for (let i = 0; i < game.moves.length; i++) {
    const mover = g.turn;
    const legal = g.legalMoves().length;
    const uci = game.moves[i]!;
    g.move(uci);
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after) break;
    if (i < t.openingPlies || legal <= 1) continue;
    const moverCp = cpOf(before.score) * (mover === 'w' ? 1 : -1);
    if (Math.abs(moverCp) >= t.decidedCp) continue;
    const playedIsBest = before.bestMove !== null && before.bestMove === uci;
    const j = judgeMove({ mover, bestScore: before.score, playedScore: playedIsBest ? before.score : after.score, playedIsBest });
    const side = acc[mover];
    side.accs.push(j.accuracy);
    if (playedIsBest) side.matches++;
    const cpLoss = playedIsBest ? 0 : Math.max(0, (cpOf(before.score) - cpOf(after.score)) * (mover === 'w' ? 1 : -1));
    side.loss += Math.min(cpLoss, 1000);
    const think = game.thinkMs[i];
    if (typeof think === 'number' && think >= 0) side.times.push(think);
  }

  const out: SideReport[] = [];
  for (const color of ['w', 'b'] as const) {
    const side = acc[color];
    const n = side.accs.length;
    if (n < t.minMovesPerGame) continue;
    const player = color === 'w' ? game.white : game.black;
    const accuracy = gameAccuracy(side.accs);
    const expAcc = expectedAccuracy(player.rating);
    const mean = side.times.reduce((a, b) => a + b, 0) / Math.max(1, side.times.length);
    const variance = side.times.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, side.times.length);
    out.push({
      gameId: game.gameId,
      playerId: player.id,
      color,
      rating: player.rating,
      moves: n,
      accuracy,
      expectedAccuracy: round1(expAcc),
      accuracyZ: round2((accuracy - expAcc) / (PER_MOVE_SD / Math.sqrt(n))),
      topMatches: side.matches,
      matchRate: round2(side.matches / n),
      expectedMatchRate: round2(expectedMatchRate(player.rating)),
      acpl: Math.round(side.loss / n),
      meanThinkMs: Math.round(mean),
      thinkCv: side.times.length >= 2 && mean > 0 ? round2(Math.sqrt(variance) / mean) : 1,
      analyzedAt: now,
    });
  }
  return out;
}

export type FlagReason = 'engine_correlation' | 'single_game_engine_correlation' | 'move_time_pattern';

export interface PlayerAssessment {
  playerId: string;
  games: number;
  moves: number;
  /** Pooled accuracy z-score across the window. */
  accuracyZ: number;
  /** Pooled top-move match z-score (binomial). */
  matchZ: number;
  mechanicalTimingGames: number;
  /** 0..100 ranking for the review queue. */
  score: number;
  reasons: FlagReason[];
}

/** Combines a player's recent per-game reports into one assessment. Pure. */
export function assessPlayer(playerId: string, reports: SideReport[], t: FairPlayThresholds = DEFAULT_THRESHOLDS): PlayerAssessment {
  const recent = [...reports].sort((a, b) => b.analyzedAt - a.analyzedAt).slice(0, t.window);
  let moves = 0;
  let accDiff = 0;
  let matches = 0;
  let expMatches = 0;
  let matchVar = 0;
  let mechanical = 0;
  const reasons = new Set<FlagReason>();
  for (const r of recent) {
    moves += r.moves;
    accDiff += (r.accuracy - r.expectedAccuracy) * r.moves;
    matches += r.topMatches;
    expMatches += r.expectedMatchRate * r.moves;
    matchVar += r.moves * r.expectedMatchRate * (1 - r.expectedMatchRate);
    if (r.thinkCv < t.mechanicalTimingCv && r.moves >= 15) mechanical++;
    if (r.accuracyZ >= t.singleGameAccuracyZ && r.matchRate >= t.singleGameMatchRate && r.moves >= 25) {
      reasons.add('single_game_engine_correlation');
    }
  }
  const accuracyZ = moves ? accDiff / (PER_MOVE_SD * Math.sqrt(moves)) : 0;
  const matchZ = matchVar ? (matches - expMatches) / Math.sqrt(matchVar) : 0;
  if (moves >= t.minPooledMoves && accuracyZ >= t.accuracyZ && matchZ >= t.matchZ) reasons.add('engine_correlation');
  if (mechanical >= t.mechanicalTimingGames && accuracyZ >= t.accuracyZ - 1) reasons.add('move_time_pattern');

  // Ranking score: strength of evidence, scaled so a clean pooled flag lands well above the queue line.
  const evidence = Math.max(0, accuracyZ) * 10 + Math.max(0, matchZ) * 8 + Math.min(mechanical, 5) * 4;
  const confidence = Math.min(1, moves / t.minPooledMoves);
  let score = Math.round(Math.min(100, evidence * (0.5 + 0.5 * confidence)));
  if (reasons.size > 0) score = Math.max(score, t.queueScore);
  return {
    playerId,
    games: recent.length,
    moves,
    accuracyZ: round2(accuracyZ),
    matchZ: round2(matchZ),
    mechanicalTimingGames: mechanical,
    score,
    reasons: [...reasons],
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

