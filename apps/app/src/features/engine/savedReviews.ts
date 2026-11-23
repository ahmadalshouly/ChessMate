import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameReview, PositionEval } from '@chessmate/core';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { ApiError, apiRequest } from '@/lib/social/api';
import { getSocialIdentity } from '@/lib/social/session';

import { hashKey, keepReview, onReviewFinished, type ReviewRequest } from './localReview';

/** Accuracy per side, 0–100. */
export type Accuracy = { w: number; b: number };

/**
 * Saved reviews.
 *
 * Online games: the first review of a game, graded on one of the players'
 * devices, is saved on the server and is what everyone sees from then on
 * (the server rebuilds it from the engine results, see games/http on the
 * server). Opening that game's review again, from any account, fetches it
 * instead of grading again.
 *
 * Every game: the accuracy of each game reviewed on this device is kept here
 * (small, so it holds far more games than the full reviews), so lists can show
 * it in place of a Review button.
 */

const ACC_KEY = 'review:acc:v1';
const MAX_ACC = 2000;
const accuracies = new Map<string, Accuracy>();
const listeners = new Set<() => void>();
let version = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const contentId = (req: ReviewRequest) => hashKey(`${req.initialFen}|${req.moves.join(' ')}`);

/** Server id of a game from its archive id (games saved on this device are prefixed "on_"). */
export const serverGameId = (archiveId: string) => archiveId.replace(/^on_/, '');

function changed() {
  version++;
  listeners.forEach((l) => l());
}

void (async () => {
  try {
    const raw = await AsyncStorage.getItem(ACC_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as [string, Accuracy][];
    for (const [k, a] of saved) if (!accuracies.has(k)) accuracies.set(k, a);
    changed();
  } catch {
    // Storage unavailable: accuracies are kept for this session only.
  }
})();

/** Remembers a game's accuracy (from a review on this device or a saved one). */
export function noteAccuracy(req: ReviewRequest, a: Accuracy) {
  const id = contentId(req);
  const old = accuracies.get(id);
  if (old && old.w === a.w && old.b === a.b) return;
  accuracies.delete(id);
  accuracies.set(id, { w: a.w, b: a.b });
  while (accuracies.size > MAX_ACC) accuracies.delete(accuracies.keys().next().value!);
  changed();
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(ACC_KEY, JSON.stringify([...accuracies])).catch(() => {});
  }, 500);
}

/** The accuracy of a game already reviewed on this device, or null. */
export function accuracyOf(req: ReviewRequest): Accuracy | null {
  return accuracies.get(contentId(req)) ?? null;
}

/** True when game review is open to this player (signed in to an account). */
export const canUseReview = () => !!getSocialIdentity();

/** The review saved for an online game, or null when nobody has reviewed it yet. */
export async function fetchSavedReview(gameId: string): Promise<GameReview | null> {
  try {
    const r = await apiRequest<{ review: GameReview }>('GET', `/api/games/${encodeURIComponent(gameId)}/review`);
    return r.review;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Saves the review graded on this device for an online game. Returns the
 * review now saved for it (an earlier one if the other player was first), or
 * null when this account can't save it (not one of the players).
 */
export async function publishReview(gameId: string, evals: PositionEval[]): Promise<GameReview | null> {
  try {
    const compact = evals.map((e) => ({ ...e, pv: e.pv.slice(0, 8) }));
    const r = await apiRequest<{ review: GameReview }>('POST', `/api/games/${encodeURIComponent(gameId)}/review`, { evals: compact });
    return r.review;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

/** Online games graded in the background when they ended: saved once grading finishes. */
const publishOnFinish = new Map<string, string>();

/** Saves this game's review on the server as soon as the device finishes grading it. */
export function publishWhenReviewed(req: ReviewRequest, gameId: string) {
  publishOnFinish.set(contentId(req), gameId);
  while (publishOnFinish.size > 20) publishOnFinish.delete(publishOnFinish.keys().next().value!);
}

onReviewFinished((req, review, evals) => {
  noteAccuracy(req, review.accuracy);
  const id = contentId(req);
  const gameId = publishOnFinish.get(id);
  if (!gameId || !evals || !canUseReview()) return;
  publishOnFinish.delete(id);
  publishReview(gameId, evals).then(
    (saved) => {
      if (!saved) return;
      keepReview(req, saved);
      noteAccuracy(req, saved.accuracy);
    },
    () => {
      // Offline: it is saved the next time the review is opened.
    },
  );
});

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Accuracy of a game, for showing it instead of a Review button: from this
 * device, or for an online game (`gameId`) from the server's saved review.
 * `known` is accuracy the caller already has (a profile row).
 */
export function useReviewAccuracy(req: ReviewRequest | null, o: { gameId?: string; known?: Accuracy | null } = {}): Accuracy | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  const local = req && req.moves.length ? accuracyOf(req) : null;
  const [remote, setRemote] = useState<Accuracy | null>(null);
  const gameId = o.gameId;
  const known = o.known ?? null;
  useEffect(() => {
    if (!gameId || local || known) return;
    let live = true;
    apiRequest<{ game: { accuracy: Accuracy | null } }>('GET', `/api/games/${encodeURIComponent(gameId)}`, undefined, { optionalAuth: true }).then(
      (r) => live && r.game.accuracy && setRemote(r.game.accuracy),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [gameId, local, known]);
  return local ?? known ?? remote;
}
