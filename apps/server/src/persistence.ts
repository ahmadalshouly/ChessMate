import { timeCategory, type Color, type GameOutcome, type PlayedMove, type Rating, type RatingCategory } from '@chessmate/core';
import {
  addMove,
  createGame,
  ensureUser,
  finishGame,
  getRatingsFor,
  loadAllRatings,
  saveRating,
  users,
  type Database,
} from '@chessmate/db';
import { isNull } from 'drizzle-orm';
import type { GameRoom } from './gameRoom';
import type { Player, PlayerStore } from './players';
import type { MemoryRatingRepository } from './ratingService';

export type RatingChange = Record<Color, { before: Rating; after: Rating }>;

/** Hooks the server calls as games progress. Implementations must not throw. */
export interface GamePersistence {
  gameStarted(room: GameRoom): void;
  moveMade(room: GameRoom, move: PlayedMove): void;
  gameEnded(room: GameRoom, outcome: GameOutcome, ratingChange?: RatingChange): void;
  /** A rating moved outside a game (fair-play refund, staff adjustment). */
  ratingAdjusted?(userId: string, category: RatingCategory, rating: Rating): void;
  /** Resolves once every queued write has finished. */
  flush(): Promise<void>;
}

const isGuest = (id: string) => id.startsWith('g_');

/**
 * Serial write queue: database writes happen in the order the game produced
 * them, off the hot path, so a slow or failing database never delays moves.
 */
class WriteQueue {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly log: (msg: string, e: unknown) => void) {}
  push(label: string, fn: () => Promise<unknown>) {
    this.tail = this.tail.then(fn).then(
      () => undefined,
      (e) => this.log(label, e),
    );
  }
  flush() {
    return this.tail;
  }
}

const defaultLog = (label: string, e: unknown) => console.error(`[db] ${label} failed:`, e);

export class DbGamePersistence implements GamePersistence {
  readonly queue: WriteQueue;
  constructor(
    private readonly db: Database,
    log = defaultLog,
  ) {
    this.queue = new WriteQueue(log);
  }

  gameStarted(room: GameRoom) {
    this.queue.push(`create game ${room.id}`, () =>
      createGame(this.db, {
        id: room.id,
        white: room.white,
        black: room.black,
        timeControl: room.timeControl,
        rated: room.rated,
        initialFen: room.initialFen,
        startedAt: new Date(room.createdAt),
      }),
    );
  }

  moveMade(room: GameRoom, move: PlayedMove) {
    const ply = room.game.ply;
    const { w, b } = room.clock.remainingMs;
    this.queue.push(`move ${room.id}#${ply}`, () =>
      addMove(this.db, room.id, { ply, uci: move.uci, san: move.san, fenAfter: move.fenAfter, whiteMs: Math.round(w), blackMs: Math.round(b) }),
    );
  }

  gameEnded(room: GameRoom, outcome: GameOutcome, ratingChange?: RatingChange) {
    const pgn = room.game.pgn(pgnHeaders(room, outcome, ratingChange));
    const finalFen = room.game.fen;
    const plyCount = room.game.ply;
    this.queue.push(`finish game ${room.id}`, async () => {
      await finishGame(this.db, room.id, {
        outcome,
        pgn,
        finalFen,
        plyCount,
        ratingsBefore: ratingChange && { w: ratingChange.w.before.rating, b: ratingChange.b.before.rating },
        ratingsAfter: ratingChange && { w: ratingChange.w.after.rating, b: ratingChange.b.after.rating },
      });
      if (!ratingChange) return;
      const category = timeCategory(room.timeControl);
      const score = outcome.winner === 'w' ? 1 : outcome.winner === 'b' ? 0 : 0.5;
      for (const [c, id, s] of [
        ['w', room.white.id, score],
        ['b', room.black.id, 1 - score],
      ] as const) {
        if (isGuest(id)) continue;
        await saveRating(this.db, { userId: id, category, rating: ratingChange[c].after, score: s, gameId: room.id });
      }
    });
  }

  ratingAdjusted(userId: string, category: RatingCategory, rating: Rating) {
    if (isGuest(userId)) return;
    this.queue.push(`adjust rating ${userId}`, () => saveRating(this.db, { userId, category, rating }));
  }

  flush() {
    return this.queue.flush();
  }
}

function pgnHeaders(room: GameRoom, outcome: GameOutcome, rc?: RatingChange): Record<string, string> {
  const d = new Date(room.createdAt);
  const termination: Record<string, string> = {
    timeout: 'Time forfeit',
    timeout_vs_insufficient: 'Time forfeit',
    abandoned: 'Abandoned',
  };
  const h: Record<string, string> = {
    Event: `ChessMate ${room.rated ? 'rated' : 'casual'} ${timeCategory(room.timeControl)} game`,
    Site: 'ChessMate',
    Date: `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`,
    White: room.white.name,
    Black: room.black.name,
    Result: outcome.result,
    WhiteElo: String(Math.round(rc?.w.before.rating ?? room.white.rating)),
    BlackElo: String(Math.round(rc?.b.before.rating ?? room.black.rating)),
    TimeControl: `${room.timeControl.initialMs / 1000}+${room.timeControl.incrementMs / 1000}`,
    Termination: termination[outcome.reason] ?? 'Normal',
    GameId: room.id,
  };
  return h;
}

/**
 * PlayerStore backed by the database. Reads stay synchronous (the server's
 * hello handler is sync) by loading registered users and their ratings into
 * memory at startup; new non-guest players are written through.
 * The auth service will replace the dev-token path with real accounts.
 */
export class DbPlayerStore implements PlayerStore {
  private players = new Map<string, Player>();
  private constructor(
    private readonly db: Database,
    private readonly queue: WriteQueue,
  ) {}

  static async load(db: Database, persistence: DbGamePersistence): Promise<DbPlayerStore> {
    const store = new DbPlayerStore(db, persistence.queue);
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(isNull(users.deletedAt));
    const ratings = await getRatingsFor(
      db,
      rows.map((r) => r.id),
    );
    for (const r of rows) {
      const { puzzle: _puzzle, ...game } = ratings.get(r.id) ?? {};
      store.players.set(r.id, { id: r.id, name: r.displayName ?? r.username, ratings: game });
    }
    return store;
  }

  get(id: string) {
    return this.players.get(id);
  }

  save(p: Player) {
    const isNew = !this.players.has(p.id);
    this.players.set(p.id, p);
    // Ratings are written by DbGamePersistence.gameEnded with history and counters.
    if (isNew && !isGuest(p.id)) {
      this.queue.push(`ensure user ${p.id}`, () => ensureUser(this.db, { id: p.id, username: p.id, displayName: p.name }));
    }
  }
}

/**
 * Warms the rating cache from the database so a server restart keeps everyone's
 * Elo (and game counts) instead of resetting to 1500. Returns the rows loaded.
 */
export async function loadRatingsInto(repo: MemoryRatingRepository, db: Database): Promise<number> {
  const rows = await loadAllRatings(db);
  for (const r of rows) {
    repo.seed(r.userId, r.category, {
      rating: r.rating,
      rd: r.rd,
      volatility: r.volatility,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      peak: r.peak,
      lastRatedAt: r.games > 0 ? r.updatedAt.getTime() : null,
    });
  }
  return rows.length;
}
