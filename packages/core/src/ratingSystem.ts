import type { GameEndReason } from './types';
import { DEFAULT_RATING, updateRating, type Rating } from './rating';
import { timeCategory, type TimeCategory, type TimeControl } from './timeControl';

/**
 * Production rating rules on top of the Glicko-2 core in `rating.ts`.
 *
 * Why Glicko-2 and not Elo with K-factor tiers:
 *  - Every rating carries its own uncertainty (RD). New and returning players
 *    move fast, established players move slowly, without hand-tuned K tiers
 *    and the cliffs between them (e.g. FIDE's K=40/20/10 at 30 games / 2400).
 *  - Uncertainty grows while a player is inactive, so someone back after six
 *    months re-converges quickly instead of being stuck on a stale number.
 *  - Beating a provisional opponent moves your rating less than beating an
 *    established one, because their RD discounts the result. Elo cannot
 *    express that, which is how rating farming on new accounts works.
 *  - "Provisional" falls out naturally (RD above a threshold) instead of
 *    being a games-played counter.
 *  - It is what Lichess uses, so players' intuitions carry over.
 *
 * Each game is rated immediately (one game per rating period), and RD decay
 * is applied for the real time elapsed since the player's last rated game.
 */

/** Every pool that has its own rating. Puzzles are rated against the puzzle's own rating. */
export type RatingCategory = TimeCategory | 'puzzle';

export const RATING_CATEGORIES: readonly RatingCategory[] = [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
  'puzzle',
];

export const GAME_RATING_CATEGORIES: readonly TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

export function isRatingCategory(x: unknown): x is RatingCategory {
  return typeof x === 'string' && (RATING_CATEGORIES as readonly string[]).includes(x);
}

export function ratingCategoryOf(tc: TimeControl): TimeCategory {
  return timeCategory(tc);
}

/** RD above which a rating is shown with "?" and excluded from leaderboards. */
export const PROVISIONAL_RD = 110;
/** Minimum rated games before a player appears on leaderboards. */
export const LEADERBOARD_MIN_GAMES = 20;
/** Days without a rated game before a player drops off leaderboards. */
export const LEADERBOARD_INACTIVE_DAYS = 30;
/** Ratings never drop below this, so beginners are never shown 0 or negatives. */
export const RATING_FLOOR = 100;
export const RATING_CEILING = 4000;
export const MAX_RD = DEFAULT_RATING.rd;

/**
 * Glicko-2 rating periods per day for RD decay. With volatility 0.06 an
 * established player (RD 50) goes back to provisional after about a year of
 * inactivity and to RD 350 after several years. Same constant as Lichess.
 */
export const RATING_PERIODS_PER_DAY = 0.21436;
const DAY_MS = 86_400_000;
const SCALE = 173.7178;

/** A player's rating in one category, with the counters a profile page needs. */
export interface CategoryRating extends Rating {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Highest rating reached while not provisional (null until then). */
  peak: number | null;
  /** Epoch ms of the last rated game, for RD decay. Null if never played. */
  lastRatedAt: number | null;
}

export type PlayerRatings = Partial<Record<RatingCategory, CategoryRating>>;

export function newCategoryRating(): CategoryRating {
  return { ...DEFAULT_RATING, games: 0, wins: 0, losses: 0, draws: 0, peak: null, lastRatedAt: null };
}

export function getCategoryRating(ratings: PlayerRatings, cat: RatingCategory): CategoryRating {
  return ratings[cat] ?? newCategoryRating();
}

/**
 * RD grows with inactivity: phi' = sqrt(phi^2 + t * sigma^2), where t is the
 * number of (fractional) rating periods since the last rated game.
 */
export function decayRd(r: Rating, lastRatedAt: number | null, now: number): Rating {
  if (lastRatedAt === null || now <= lastRatedAt) return { ...r };
  const periods = ((now - lastRatedAt) / DAY_MS) * RATING_PERIODS_PER_DAY;
  const phi = r.rd / SCALE;
  const phiNew = Math.sqrt(phi * phi + periods * r.volatility * r.volatility);
  return { ...r, rd: Math.min(MAX_RD, phiNew * SCALE) };
}

/** The rating as it stands right now, including inactivity decay. */
export function currentRating(cr: CategoryRating, now: number): CategoryRating {
  return { ...cr, ...decayRd(cr, cr.lastRatedAt, now) };
}

export function isProvisionalRating(r: Pick<Rating, 'rd'>): boolean {
  return r.rd > PROVISIONAL_RD;
}

/** "1534" or "1500?" for provisional ratings. */
export function formatRating(r: Pick<Rating, 'rating' | 'rd'>): string {
  return `${Math.round(r.rating)}${isProvisionalRating(r) ? '?' : ''}`;
}

/** "+12", "-8", "±0". */
export function formatRatingDelta(delta: number): string {
  const d = Math.round(delta);
  return d > 0 ? `+${d}` : d < 0 ? `${d}` : '±0';
}

/** 95% confidence interval, for "1500 ± 120" style tooltips. */
export function ratingInterval(r: Pick<Rating, 'rating' | 'rd'>): [number, number] {
  return [Math.round(r.rating - 2 * r.rd), Math.round(r.rating + 2 * r.rd)];
}

export function isOnLeaderboard(cr: CategoryRating, now: number): boolean {
  if (cr.games < LEADERBOARD_MIN_GAMES || cr.lastRatedAt === null) return false;
  if (now - cr.lastRatedAt > LEADERBOARD_INACTIVE_DAYS * DAY_MS) return false;
  return !isProvisionalRating(currentRating(cr, now));
}

// ---------------------------------------------------------------------------
// Rated vs casual

/** Rated games need at least this many plies; shorter games are aborted, not rated. */
export const MIN_RATED_PLIES = 2;

export type UnratedReason =
  | 'casual'
  | 'guest'
  | 'same_player'
  | 'aborted'
  | 'too_short'
  | 'unrated_category'
  | 'no_result';

export interface RatedGameCheck {
  rated: boolean;
  whiteId: string;
  blackId: string;
  whiteIsGuest: boolean;
  blackIsGuest: boolean;
  timeControl: TimeControl;
  reason: GameEndReason;
  winner: 'w' | 'b' | null;
  /** Half-moves played. */
  plies: number;
}

/** Decides whether a finished game changes ratings. Null means it does. */
export function unratedReason(g: RatedGameCheck): UnratedReason | null {
  if (!g.rated) return 'casual';
  if (g.whiteIsGuest || g.blackIsGuest) return 'guest';
  if (g.whiteId === g.blackId) return 'same_player';
  if (g.reason === 'aborted') return 'aborted';
  if (g.plies < MIN_RATED_PLIES) return 'too_short';
  if (!GAME_RATING_CATEGORIES.includes(ratingCategoryOf(g.timeControl))) return 'unrated_category';
  return null;
}

/** Players may only create rated seeks if they are signed in (not guests). */
export function canSeekRated(isGuest: boolean): boolean {
  return !isGuest;
}

// ---------------------------------------------------------------------------
// Applying results

export type GameScore = 0 | 0.5 | 1;

export interface RatingChange {
  category: RatingCategory;
  before: CategoryRating;
  after: CategoryRating;
  /** Rounded displayed change (after.rating - before.rating). */
  delta: number;
}

function clampRating(x: number) {
  return Math.max(RATING_FLOOR, Math.min(RATING_CEILING, x));
}

/** Applies one result against one opponent. Both ratings are decayed to `now` first. */
export function applyResult(
  category: RatingCategory,
  player: CategoryRating,
  opponent: Rating & { lastRatedAt?: number | null },
  score: GameScore,
  now: number,
): RatingChange {
  const before = currentRating(player, now);
  const opp = decayRd(opponent, opponent.lastRatedAt ?? null, now);
  const next = updateRating(before, [{ opponent: opp, score }]);
  const rating = clampRating(next.rating);
  const provisional = isProvisionalRating(next);
  const after: CategoryRating = {
    rating,
    rd: next.rd,
    volatility: next.volatility,
    games: before.games + 1,
    wins: before.wins + (score === 1 ? 1 : 0),
    losses: before.losses + (score === 0 ? 1 : 0),
    draws: before.draws + (score === 0.5 ? 1 : 0),
    peak: provisional ? before.peak : Math.max(before.peak ?? -Infinity, rating),
    lastRatedAt: now,
  };
  return { category, before, after, delta: Math.round(after.rating) - Math.round(before.rating) };
}

export function scoreFor(color: 'w' | 'b', winner: 'w' | 'b' | null): GameScore {
  if (winner === null) return 0.5;
  return winner === color ? 1 : 0;
}

/** Rates a finished game for both players simultaneously (each against the other's pre-game rating). */
export function rateGame(
  category: TimeCategory,
  white: CategoryRating,
  black: CategoryRating,
  winner: 'w' | 'b' | null,
  now: number,
): { w: RatingChange; b: RatingChange } {
  return {
    w: applyResult(category, white, black, scoreFor('w', winner), now),
    b: applyResult(category, black, white, scoreFor('b', winner), now),
  };
}

/**
 * Puzzle rating: the player plays the puzzle as an opponent. The puzzle's own
 * rating is updated too (it "wins" when the player fails), so puzzle
 * difficulty self-calibrates. Puzzles never decay.
 */
export function ratePuzzleAttempt(
  player: CategoryRating,
  puzzle: Rating,
  solved: boolean,
  now: number,
): { player: RatingChange; puzzle: Rating } {
  const change = applyResult('puzzle', player, puzzle, solved ? 1 : 0, now);
  const p = updateRating(puzzle, [{ opponent: currentRating(player, now), score: solved ? 0 : 1 }]);
  return { player: change, puzzle: { ...p, rating: clampRating(p.rating) } };
}

/**
 * Preview of what a game would do to `player`'s rating, for the
 * "+8 / ±0 / -9" line shown before a rated game starts.
 */
export function ratingStakes(player: CategoryRating, opponent: CategoryRating, category: RatingCategory, now: number) {
  return {
    win: applyResult(category, player, opponent, 1, now).delta,
    draw: applyResult(category, player, opponent, 0.5, now).delta,
    loss: applyResult(category, player, opponent, 0, now).delta,
  };
}

// ---------------------------------------------------------------------------
// History

export interface RatingHistoryEntry {
  userId: string;
  category: RatingCategory;
  /** Game id, or puzzle id for the puzzle category. */
  sourceId: string;
  /** Opponent user id; null for puzzles. */
  opponentId: string | null;
  opponentRating: number;
  score: GameScore;
  ratingBefore: number;
  ratingAfter: number;
  rdBefore: number;
  rdAfter: number;
  delta: number;
  at: number;
}

export function historyEntry(
  userId: string,
  sourceId: string,
  opponentId: string | null,
  opponentRating: number,
  score: GameScore,
  change: RatingChange,
  at: number,
): RatingHistoryEntry {
  return {
    userId,
    category: change.category,
    sourceId,
    opponentId,
    opponentRating: Math.round(opponentRating),
    score,
    ratingBefore: change.before.rating,
    ratingAfter: change.after.rating,
    rdBefore: change.before.rd,
    rdAfter: change.after.rd,
    delta: change.delta,
    at,
  };
}

export interface RatingChartPoint {
  /** UTC day start, epoch ms. */
  day: number;
  rating: number;
}

/**
 * Collapses history to one point per UTC day (the closing rating that day),
 * which is what a profile rating chart plots.
 */
export function dailyRatingChart(entries: readonly RatingHistoryEntry[]): RatingChartPoint[] {
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  const byDay = new Map<number, number>();
  for (const e of sorted) byDay.set(Math.floor(e.at / DAY_MS) * DAY_MS, Math.round(e.ratingAfter));
  return [...byDay.entries()].map(([day, rating]) => ({ day, rating }));
}

/** Rating change over the last `days` days (0 if no games in the window). */
export function ratingProgress(entries: readonly RatingHistoryEntry[], now: number, days = 30): number {
  const since = now - days * DAY_MS;
  const window = entries.filter((e) => e.at >= since).sort((a, b) => a.at - b.at);
  if (window.length === 0) return 0;
  return Math.round(window[window.length - 1]!.ratingAfter) - Math.round(window[0]!.ratingBefore);
}

// ---------------------------------------------------------------------------
// Matchmaking range

export interface RatingRangeOptions {
  /** Gap accepted immediately for an established player. */
  baseGap: number;
  /** Extra gap per point of RD above the provisional threshold. */
  rdFactor: number;
  /** Widening per second of waiting. */
  gapPerSecond: number;
  maxGap: number;
}

export const DEFAULT_RANGE_OPTIONS: RatingRangeOptions = { baseGap: 100, rdFactor: 1, gapPerSecond: 20, maxGap: 800 };

/**
 * Symmetric gap this seek accepts now. Provisional players (high RD) get a
 * wider window because their number is a rough guess anyway; the window then
 * widens with waiting time so nobody waits forever on a quiet pool.
 */
export function matchmakingGap(
  r: Pick<Rating, 'rd'>,
  waitedMs: number,
  opts: RatingRangeOptions = DEFAULT_RANGE_OPTIONS,
): number {
  const rdBonus = Math.max(0, r.rd - PROVISIONAL_RD) * opts.rdFactor;
  const waitBonus = (Math.max(0, waitedMs) / 1000) * opts.gapPerSecond;
  return Math.min(opts.maxGap, opts.baseGap + rdBonus + waitBonus);
}

/** Player-chosen relative range, like Lichess's "-200 / +300". */
export interface RatingRangePreference {
  below: number;
  above: number;
}

export const RATING_RANGE_STEPS = [50, 100, 150, 200, 300, 400, 500, 700, 1000] as const;

/** Turns a relative preference into absolute [min, max] bounds; clamps to sane values. */
export function resolveRatingRange(rating: number, pref: RatingRangePreference): [number, number] {
  const clampGap = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1000, Math.round(x))) : 1000);
  const r = Math.round(rating);
  return [Math.max(RATING_FLOOR, r - clampGap(pref.below)), Math.min(RATING_CEILING, r + clampGap(pref.above))];
}

/** Validates an absolute range sent by a client. Returns null if unusable. */
export function sanitizeRatingRange(range: unknown, ownRating: number): [number, number] | null {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [lo, hi] = range.map(Number) as [number, number];
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return null;
  const r = Math.round(ownRating);
  // A range that excludes the player's own rating would never pair fairly; widen to include it.
  return [Math.max(RATING_FLOOR, Math.min(lo, r)), Math.min(RATING_CEILING, Math.max(hi, r))];
}
