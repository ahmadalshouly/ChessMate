import { listUserGames, type Database, type GameRow } from '@chessmate/db';
import type { GameEndReason, GameResult, TimeCategory } from '@chessmate/core';

import type { FinishedGame } from './types';

/** A finished game row as the profile service reads it (recent games, streaks, history). */
export function toFinishedGame(g: GameRow): FinishedGame {
  const delta = (before: number | null, after: number | null) => (before == null || after == null ? null : after - before);
  return {
    id: g.id,
    whiteId: g.whiteUserId ?? '',
    blackId: g.blackUserId ?? '',
    whiteName: g.whiteName,
    blackName: g.blackName,
    whiteRating: Math.round(g.whiteRatingBefore ?? 0),
    blackRating: Math.round(g.blackRatingBefore ?? 0),
    whiteDelta: delta(g.whiteRatingBefore, g.whiteRatingAfter),
    blackDelta: delta(g.blackRatingBefore, g.blackRatingAfter),
    initialMs: g.initialMs,
    incrementMs: g.incrementMs,
    category: g.timeCategory as TimeCategory,
    rated: g.rated,
    result: g.result as GameResult,
    reason: (g.endReason ?? 'aborted') as GameEndReason,
    // Only the count is used (moves played); the move list itself is not loaded here.
    moves: new Array<string>(g.plyCount).fill(''),
    endedAt: (g.endedAt ?? g.startedAt).getTime(),
  };
}

/** Finished games of an account from the database, newest first, aborted games left out. */
export function dbGamesOf(db: Database) {
  return async (userId: string, limit: number): Promise<FinishedGame[]> => {
    const rows = await listUserGames(db, userId, { limit: limit + 10 });
    return rows.filter((g) => g.result !== '*' && g.endReason !== 'aborted').slice(0, limit).map(toFinishedGame);
  };
}
