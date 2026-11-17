import type { MoveJudgement } from './evaluation';
import { formatScore, type Score } from './evaluation';
import type { PositionInsight } from './threats';
import { pieceName } from './threats';
import type { Color } from './types';

/**
 * Structured context handed to the AI coach. Built from engine output and
 * our own tactical analysis so the language model explains facts rather
 * than calculating chess itself.
 */
export interface CoachContext {
  fenBefore: string;
  movePlayed: string; // SAN
  mover: Color;
  playerRating?: number;
  bestMove: string; // SAN
  bestLine: string[]; // SAN
  scoreBefore: Score; // White POV, best play
  scoreAfter: Score; // White POV, after the played move
  judgement: MoveJudgement;
  insightAfter: PositionInsight; // from the mover's perspective
}

export const COACH_SYSTEM_PROMPT = `You are ChessMate Coach, a friendly and precise chess teacher.
You receive engine facts about one move. Never invent variations: only cite moves given to you.
Explain in 2-4 short sentences, adapted to the player's rating:
1) what the played move does, 2) why the best move is better (if different), 3) one practical takeaway.
Use plain language; mention concrete squares and pieces.`;

export function buildCoachPrompt(ctx: CoachContext): string {
  const side = ctx.mover === 'w' ? 'White' : 'Black';
  const lines = [
    `Position (FEN, before the move): ${ctx.fenBefore}`,
    `${side} played: ${ctx.movePlayed}`,
    `Classification: ${ctx.judgement.classification} (expected-score loss ${(ctx.judgement.loss * 100).toFixed(1)}%)`,
    `Engine evaluation before: ${formatScore(ctx.scoreBefore)}, after the move: ${formatScore(ctx.scoreAfter)} (White's view)`,
    `Engine best move: ${ctx.bestMove}; main line: ${ctx.bestLine.join(' ')}`,
  ];
  if (ctx.playerRating) lines.push(`Player rating: ${Math.round(ctx.playerRating)}`);
  const h = ctx.insightAfter.hanging;
  if (h.length) {
    lines.push(`Now hanging for ${side}: ${h.map((x) => `${pieceName(x.piece)} on ${x.square}`).join(', ')}`);
  }
  const t = ctx.insightAfter.threats.slice(0, 3);
  if (t.length) lines.push(`Opponent threats now: ${t.map((x) => x.description).join('; ')}`);
  return lines.join('\n');
}

/** Deterministic one-line feedback used offline or before the AI reply arrives. */
export function quickFeedback(ctx: Pick<CoachContext, 'movePlayed' | 'bestMove' | 'judgement' | 'insightAfter'>): string {
  const { classification } = ctx.judgement;
  const top = ctx.insightAfter.threats[0];
  const hang = ctx.insightAfter.hanging[0];
  switch (classification) {
    case 'best':
      return `${ctx.movePlayed} is the top engine choice.`;
    case 'forced':
      return `${ctx.movePlayed} was the only legal move.`;
    case 'book':
      return `${ctx.movePlayed} is a known opening move.`;
    case 'masterpiece':
      return `${ctx.movePlayed}!!! A Masterpiece: the queen is offered and the engine backs it.`;
    case 'brilliant':
      return `${ctx.movePlayed}!! A sound sacrifice. The material comes back with interest.`;
    case 'great':
      return `${ctx.movePlayed}! The only move that keeps the advantage. Everything else was clearly worse.`;
    case 'miss':
      return `${ctx.movePlayed} misses a chance after your opponent's error. ${ctx.bestMove} would have punished it.`;
    case 'excellent':
    case 'good':
      return `${ctx.movePlayed} is solid. ${ctx.bestMove} was slightly stronger.`;
    default: {
      const reason = top
        ? ` It allows ${top.description}.`
        : hang
          ? ` Your ${pieceName(hang.piece)} on ${hang.square} is left undefended.`
          : '';
      return `${ctx.movePlayed} is ${article(classification)} ${classification}.${reason} Better was ${ctx.bestMove}.`;
    }
  }
}

function article(word: string) {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}
