import { START_FEN } from '@chessmate/core';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';

import { useReviewAccuracy, type Accuracy } from './savedReviews';

/** Accuracy as shown on buttons and rows: one decimal, no trailing ".0". */
export const formatAccuracy = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * What a Review button should say and do for a finished game:
 * - signed out: "Sign in to review", opening sign-in (review is for accounts);
 * - reviewed already: its accuracy ("Accuracy ○ 84.2 · ● 71.5") instead of "Review";
 * - otherwise `label` is null and the screen keeps its own Review wording.
 */
export function useReviewEntry(game: { moves: string[]; initialFen?: string; gameId?: string } | null, known?: Accuracy | null) {
  const tr = useT();
  const signedIn = useAuth().status === 'signedIn';
  const movesKey = game ? game.moves.join(',') : '';
  const initialFen = game?.initialFen || START_FEN;
  const req = useMemo(() => (movesKey ? { moves: movesKey.split(','), initialFen } : null), [movesKey, initialFen]);
  const accuracy = useReviewAccuracy(signedIn ? req : null, { gameId: signedIn ? game?.gameId : undefined, known });
  const label = !signedIn ? tr('review.signIn.button') : accuracy ? tr('review.entry', { w: formatAccuracy(accuracy.w), b: formatAccuracy(accuracy.b) }) : null;
  /** Runs `open` when the player may review, otherwise goes to sign-in. */
  const press = (open: () => void) => (signedIn ? open() : router.push('/sign-in'));
  return { signedIn, accuracy, label, press };
}
