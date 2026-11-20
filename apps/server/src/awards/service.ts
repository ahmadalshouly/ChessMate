import {
  AWARDS_BY_ID,
  applyGameToStats,
  awardProgress,
  checkmatePatterns,
  cleanAwardStats,
  detectOpening,
  emptyAwardStats,
  newlyEarned,
  timeCategory,
  type AwardGameFacts,
  type Game,
  type AwardsView,
  type EarnedAward,
  type AwardStats,
  type EarnedLevel,
  type MateType,
} from '@chessmate/core';
import { addUserAwards, awardHistory, getAwardStats, getUser, listUserAwards, saveAwardStats, type Database } from '@chessmate/db';

/** A finished game from one player's side, as the server knows it. */
export interface AwardGameInput {
  gameId: string;
  result: AwardGameFacts['result'];
  openingName: string | null;
  category: AwardGameFacts['category'];
  ratingAfter: number | null;
  opponentId: string | null;
  mateTypes: MateType[];
}

export interface AwardsServiceOptions {
  db?: Database;
  now?: () => number;
}

const CACHE_LIMIT = 5_000;

/**
 * Keeps each player's award counters, updates them after every finished game
 * and records the levels earned. The first time a player is seen, their
 * counters are rebuilt from their stored games, so awards cover the games
 * they played before awards existed (dated by the game that earned them).
 */
export class AwardsService {
  private readonly cache = new Map<string, AwardStats>();
  /** Without a database (dev), earned levels live here. */
  private readonly memoryEarned = new Map<string, EarnedAward[]>();
  /** One update at a time per player, so games never overwrite each other. */
  private readonly chains = new Map<string, Promise<unknown>>();
  private onEarned: (userId: string, earned: EarnedLevel[], gameId: string) => void = () => {};

  constructor(private readonly opts: AwardsServiceOptions = {}) {}

  get db() {
    return this.opts.db;
  }

  attach(hooks: { earned: (userId: string, earned: EarnedLevel[], gameId: string) => void }) {
    this.onEarned = hooks.earned;
  }

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  private serial<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(userId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.chains.set(userId, tail);
    void tail.then(() => {
      if (this.chains.get(userId) === tail) this.chains.delete(userId);
    });
    return next;
  }

  private remember(userId: string, stats: AwardStats) {
    this.cache.delete(userId);
    this.cache.set(userId, stats);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
  }

  /** Counters for a player: cache, then database, then rebuilt from their games. */
  private async statsOf(userId: string, exceptGameId?: string): Promise<AwardStats> {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    const db = this.opts.db;
    if (!db) return emptyAwardStats();
    const stored = await getAwardStats(db, userId);
    const stats = stored ? cleanAwardStats(stored) : await this.rebuild(userId, exceptGameId);
    this.remember(userId, stats);
    return stats;
  }

  private async rebuild(userId: string, exceptGameId?: string): Promise<AwardStats> {
    const db = this.opts.db!;
    let stats = emptyAwardStats();
    const levels: { awardId: string; level: number; gameId: string; earnedAt: Date }[] = [];
    for (const g of await awardHistory(db, userId, exceptGameId)) {
      const result = g.winner === null ? 'draw' : g.winner === g.color ? 'win' : 'loss';
      const next = applyGameToStats(stats, {
        result,
        openingName: g.openingName ?? (g.openingMoves.length ? (detectOpening(g.openingMoves, g.initialFen)?.name ?? null) : null),
        category: timeCategory({ initialMs: g.initialMs, incrementMs: g.incrementMs }),
        ratingAfter: g.ratingAfter,
        opponentCountry: g.opponentCountry,
        mateTypes: g.mate && result === 'win' ? checkmatePatterns(g.mate.fenBefore, g.mate.uci, g.plyCount) : [],
      });
      for (const e of newlyEarned(stats, next)) levels.push({ awardId: e.id, level: e.level, gameId: g.id, earnedAt: g.endedAt ?? new Date(this.now()) });
      stats = next;
    }
    await saveAwardStats(db, userId, stats);
    for (let i = 0; i < levels.length; i += 500) await addUserAwards(db, userId, levels.slice(i, i + 500));
    return stats;
  }

  /** Counts a finished game for a player and records any levels it unlocked. */
  gameFinished(userId: string, input: AwardGameInput): Promise<EarnedLevel[]> {
    return this.serial(userId, async () => {
      const before = await this.statsOf(userId, input.gameId);
      const db = this.opts.db;
      const opponentCountry = input.opponentId && db ? ((await getUser(db, input.opponentId))?.country ?? null) : null;
      const after = applyGameToStats(before, { ...input, opponentCountry });
      const earned = newlyEarned(before, after);
      this.remember(userId, after);
      const at = this.now();
      if (db) {
        await saveAwardStats(db, userId, after);
        await addUserAwards(
          db,
          userId,
          earned.map((e) => ({ awardId: e.id, level: e.level, gameId: input.gameId, earnedAt: new Date(at) })),
        );
      } else {
        const list = this.memoryEarned.get(userId) ?? [];
        list.unshift(...earned.map((e) => ({ ...e, earnedAt: at, gameId: input.gameId })));
        this.memoryEarned.set(userId, list);
      }
      if (earned.length) this.onEarned(userId, earned, input.gameId);
      return earned;
    });
  }

  async view(userId: string): Promise<AwardsView> {
    const stats = await this.serial(userId, () => this.statsOf(userId));
    const db = this.opts.db;
    const earned: EarnedAward[] = db
      ? (await listUserAwards(db, userId))
          .filter((r) => AWARDS_BY_ID.has(r.awardId))
          .map((r) => ({ id: r.awardId, level: r.level, earnedAt: r.earnedAt.getTime(), gameId: r.gameId }))
      : (this.memoryEarned.get(userId) ?? []);
    return { userId, progress: awardProgress(stats), earned, countries: stats.countries, countriesBeaten: stats.countriesBeaten };
  }
}

/** What a finished game means for one side, from the live game room. */
export function gameFacts(
  room: {
    id: string;
    initialFen: string;
    timeControl: { initialMs: number; incrementMs: number };
    game: Game;
  },
  outcome: { winner: 'w' | 'b' | null; reason: string },
  color: 'w' | 'b',
  ratingAfter: number | null,
  opponentId: string | null,
): AwardGameInput {
  const result = outcome.winner === null ? 'draw' : outcome.winner === color ? 'win' : 'loss';
  let mateTypes: MateType[] = [];
  if (outcome.reason === 'checkmate' && result === 'win') {
    const last = room.game.raw.history({ verbose: true }).at(-1);
    if (last) mateTypes = checkmatePatterns(last.before, `${last.from}${last.to}${last.promotion ?? ''}`, room.game.ply);
  }
  return {
    gameId: room.id,
    result,
    openingName: detectOpening(room.game.uciHistory(), room.initialFen)?.name ?? null,
    category: timeCategory(room.timeControl),
    ratingAfter,
    opponentId,
    mateTypes,
  };
}
