import type { Color } from './types';

/** Engine score. Always from White's point of view. */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

export type MoveClass = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book' | 'forced';

/** Logistic slope converting centipawns to expected score. */
const K = 0.004;

/** Expected score (0..1) for White given an engine score. */
export function expectedScore(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 1 : score.mate < 0 ? 0 : 0.5;
  return 1 / (1 + Math.exp(-K * score.cp));
}

export function expectedScoreFor(score: Score, color: Color): number {
  const s = expectedScore(score);
  return color === 'w' ? s : 1 - s;
}

/** Converts a score reported relative to the side to move into White's view. */
export function toWhitePov(score: Score, sideToMove: Color): Score {
  if (sideToMove === 'w') return score;
  return score.mate !== undefined ? { mate: -score.mate } : { cp: -score.cp };
}

export function formatScore(score: Score): string {
  if (score.mate !== undefined) return score.mate === 0 ? '#' : `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`;
  const p = score.cp / 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}`;
}

/** Fill fraction (0..1) for an evaluation bar, White at the bottom. */
export function evalBarFraction(score: Score): number {
  return expectedScore(score);
}

export interface MoveJudgement {
  classification: MoveClass;
  /** Drop in expected score for the mover, 0..1. */
  loss: number;
  /** Per-move accuracy 0..100. */
  accuracy: number;
}

const THRESHOLDS: [MoveClass, number][] = [
  ['excellent', 0.02],
  ['good', 0.05],
  ['inaccuracy', 0.1],
  ['mistake', 0.2],
];

/**
 * Judges a move by how much expected score the mover gave up compared with
 * the engine's best line.
 */
export function judgeMove(params: {
  mover: Color;
  bestScore: Score;
  playedScore: Score;
  playedIsBest: boolean;
  legalMoveCount?: number;
}): MoveJudgement {
  const before = expectedScoreFor(params.bestScore, params.mover);
  const after = expectedScoreFor(params.playedScore, params.mover);
  const loss = Math.max(0, before - after);
  const accuracy = moveAccuracy(loss);
  if (params.legalMoveCount === 1) return { classification: 'forced', loss, accuracy };
  if (params.playedIsBest || loss < 0.005) return { classification: 'best', loss, accuracy: 100 };
  // Missing a forced mate while still winning comfortably is not a blunder.
  let classification: MoveClass = 'blunder';
  for (const [cls, max] of THRESHOLDS) {
    if (loss < max) {
      classification = cls;
      break;
    }
  }
  return { classification, loss, accuracy };
}

export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 100 * Math.exp(-5 * loss)));
}

/** Game accuracy: harmonic-leaning mean so a few blunders weigh heavily. */
export function gameAccuracy(moveAccuracies: number[]): number {
  if (moveAccuracies.length === 0) return 100;
  const mean = moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length;
  const harmonic = moveAccuracies.length / moveAccuracies.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return Math.round(((mean + harmonic) / 2) * 10) / 10;
}
