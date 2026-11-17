import {
  currentRating,
  getCategoryRating,
  historyEntry,
  isProvisionalRating,
  matchmakingGap,
  rateGame,
  ratePuzzleAttempt,
  ratingCategoryOf,
  scoreFor,
  unratedReason,
  type CategoryRating,
  type PlayerRatings,
  type Rating,
  type RatedGameCheck,
  type RatingCategory,
  type RatingChange,
  type RatingHistoryEntry,
  type TimeControl,
  type UnratedReason,
} from '@chessmate/core';

/**
 * Storage boundary for ratings and their history. The in-memory version is
 * used in development and tests; the SQL version should implement the same
 * interface with `saveGameResult` in a single transaction. Suggested schema:
 *
 *   CREATE TABLE ratings (
 *     user_id TEXT, category TEXT, rating REAL, rd REAL, volatility REAL,
 *     games INT, wins INT, losses INT, draws INT, peak REAL, last_rated_at INT,
 *     PRIMARY KEY (user_id, category));
 *   CREATE TABLE rating_history (
 *     user_id TEXT, category TEXT, source_id TEXT, opponent_id TEXT,
 *     opponent_rating INT, score REAL, rating_before REAL, rating_after REAL,
 *     rd_before REAL, rd_after REAL, delta INT, at INT,
 *     PRIMARY KEY (user_id, category, source_id));
 *   CREATE INDEX rating_history_user ON rating_history(user_id, category, at);
 */
export interface RatingRepository {
  getAll(userId: string): PlayerRatings;
  /** Persists new ratings and history entries atomically. */
  commit(updates: { userId: string; category: RatingCategory; rating: CategoryRating }[], history: RatingHistoryEntry[]): void;
  history(userId: string, category: RatingCategory, opts?: { since?: number; limit?: number }): RatingHistoryEntry[];
  /** True if this source (game/puzzle id) was already rated for this user. Makes rating idempotent. */
  hasHistory(userId: string, category: RatingCategory, sourceId: string): boolean;
}

export class MemoryRatingRepository implements RatingRepository {
  private ratings = new Map<string, PlayerRatings>();
  private log = new Map<string, RatingHistoryEntry[]>();

  getAll(userId: string): PlayerRatings {
    return { ...(this.ratings.get(userId) ?? {}) };
  }

  commit(updates: { userId: string; category: RatingCategory; rating: CategoryRating }[], history: RatingHistoryEntry[]) {
    for (const u of updates) this.ratings.set(u.userId, { ...(this.ratings.get(u.userId) ?? {}), [u.category]: u.rating });
    for (const h of history) {
      const k = `${h.userId}:${h.category}`;
      const list = this.log.get(k) ?? [];
      list.push(h);
      this.log.set(k, list);
    }
  }

  history(userId: string, category: RatingCategory, opts: { since?: number; limit?: number } = {}) {
    let list = (this.log.get(`${userId}:${category}`) ?? []).filter((e) => e.at >= (opts.since ?? -Infinity));
    list = [...list].sort((a, b) => a.at - b.at);
    return opts.limit !== undefined ? list.slice(-opts.limit) : list;
  }

  hasHistory(userId: string, category: RatingCategory, sourceId: string) {
    return (this.log.get(`${userId}:${category}`) ?? []).some((e) => e.sourceId === sourceId);
  }
}

export interface FinishedGame extends RatedGameCheck {
  gameId: string;
  endedAt: number;
}

export type GameRatingResult =
  | { rated: true; category: RatingCategory; w: RatingChange; b: RatingChange }
  | { rated: false; reason: UnratedReason | 'already_rated' };

/** All rating reads and writes go through here so rules live in one place. */
export class RatingService {
  constructor(private readonly repo: RatingRepository = new MemoryRatingRepository()) {}

  /** Current rating (with inactivity decay) in a category. */
  get(userId: string, category: RatingCategory, now: number): CategoryRating {
    return currentRating(getCategoryRating(this.repo.getAll(userId), category), now);
  }

  forTimeControl(userId: string, tc: TimeControl, now: number): CategoryRating {
    return this.get(userId, ratingCategoryOf(tc), now);
  }

  all(userId: string, now: number): Record<RatingCategory, CategoryRating & { provisional: boolean }> {
    const stored = this.repo.getAll(userId);
    const out = {} as Record<RatingCategory, CategoryRating & { provisional: boolean }>;
    for (const cat of ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle'] as const) {
      const r = currentRating(getCategoryRating(stored, cat), now);
      out[cat] = { ...r, provisional: isProvisionalRating(r) };
    }
    return out;
  }

  history(userId: string, category: RatingCategory, opts?: { since?: number; limit?: number }) {
    return this.repo.history(userId, category, opts);
  }

  /** Matchmaking gap for this player's seek after waiting `waitedMs`. */
  gapFor(userId: string, tc: TimeControl, waitedMs: number, now: number): number {
    return matchmakingGap(this.forTimeControl(userId, tc, now), waitedMs);
  }

  /** Rates a finished game. Idempotent per game id; casual/aborted games are no-ops. */
  applyGame(g: FinishedGame): GameRatingResult {
    const reason = unratedReason(g);
    if (reason) return { rated: false, reason };
    const category = ratingCategoryOf(g.timeControl);
    if (this.repo.hasHistory(g.whiteId, category, g.gameId)) return { rated: false, reason: 'already_rated' };
    const white = getCategoryRating(this.repo.getAll(g.whiteId), category);
    const black = getCategoryRating(this.repo.getAll(g.blackId), category);
    const { w, b } = rateGame(category, white, black, g.winner, g.endedAt);
    this.repo.commit(
      [
        { userId: g.whiteId, category, rating: w.after },
        { userId: g.blackId, category, rating: b.after },
      ],
      [
        historyEntry(g.whiteId, g.gameId, g.blackId, b.before.rating, scoreFor('w', g.winner), w, g.endedAt),
        historyEntry(g.blackId, g.gameId, g.whiteId, w.before.rating, scoreFor('b', g.winner), b, g.endedAt),
      ],
    );
    return { rated: true, category, w, b };
  }

  /** Rates a puzzle attempt; returns the player's change and the puzzle's new rating to store. */
  applyPuzzle(userId: string, puzzleId: string, puzzle: Rating, solved: boolean, now: number) {
    if (this.repo.hasHistory(userId, 'puzzle', puzzleId)) return null;
    const player = getCategoryRating(this.repo.getAll(userId), 'puzzle');
    const res = ratePuzzleAttempt(player, puzzle, solved, now);
    this.repo.commit(
      [{ userId, category: 'puzzle', rating: res.player.after }],
      [historyEntry(userId, puzzleId, null, puzzle.rating, solved ? 1 : 0, res.player, now)],
    );
    return res;
  }
}
