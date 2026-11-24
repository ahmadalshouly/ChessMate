import type { MoveJudgement } from './evaluation';
import type { PositionInsight } from './threats';
import { pieceName } from './threats';

/** Facts about one played move, from engine output and our own tactical analysis. */
export interface MoveFeedbackFacts {
  movePlayed: string; // SAN
  bestMove: string; // SAN
  judgement: MoveJudgement;
  insightAfter: PositionInsight; // from the mover's perspective
}

/** Deterministic one-line feedback for a move, shown in analysis and game review. */
export function quickFeedback(ctx: MoveFeedbackFacts): string {
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
