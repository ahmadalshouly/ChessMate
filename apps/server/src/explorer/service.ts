import {
  EXPLORER_MAX_MOVES,
  EXPLORER_MAX_PLY,
  START_FEN,
  explorerCacheKey,
  explorerKey,
  explorerTallies,
  lookupOpening,
  normalizeExplorerFilters,
  parseLichessExplorer,
  theoryPlies,
  type Color,
  type ExplorerFilters,
  type ExplorerPosition,
  type ExplorerSource,
} from '@chessmate/core';
import {
  addExplorerGame,
  cachedExplorer,
  explorerBackfillPage,
  explorerMovesAt,
  explorerTotalsAt,
  getAppSetting,
  pruneExplorerCache,
  setAppSetting,
  storeExplorer,
  type Database,
  type ExplorerBackfillCursor,
} from '@chessmate/db';

import { ExplorerError, LichessExplorer } from './lichess';

/** How long an answer from Lichess counts as fresh. Its databases grow by a month at a time. */
const FRESH_MS: Record<'lichess' | 'masters', number> = { lichess: 7 * 86_400_000, masters: 30 * 86_400_000 };
/** ChessMate counts change with every game: a short memory, so busy positions don't hit the database each time. */
const CHESSMATE_FRESH_MS = 60_000;
/** Positions kept in memory (a few KB each). */
const MEMORY_POSITIONS = 4_000;
/** Games whose theory length is remembered (the device and the server ask about the same game). */
const MEMORY_THEORY = 500;
/** Database cache bounds: older answers are fetched again anyway. */
const KEEP_CACHE_ROWS = 200_000;
const KEEP_CACHE_MS = 60 * 86_400_000;
const BACKFILL_KEY = 'explorer.backfill';
const BACKFILL_PAGE = 200;

interface Cached {
  position: ExplorerPosition;
  at: number;
}

interface BackfillState {
  /** Games that ended up to here are counted by the backfill; later ones were counted as they finished. */
  cutoff: string;
  cursor: ExplorerBackfillCursor | null;
  done: boolean;
}

export interface ExplorerServiceOptions {
  /** Cache and ChessMate counts. Without one, nothing is kept across restarts and the ChessMate collection is empty. */
  db?: Database | null;
  lichess?: LichessExplorer | null;
  now?: () => number;
  log?: (msg: string, e?: unknown) => void;
}

/** A finished game, as the explorer counts it. */
export interface ExplorerGame {
  initialFen: string;
  moves: string[];
  winner: Color | null;
  /** Both players' ratings before the game, when known. */
  ratings?: { w: number; b: number } | null;
}

/**
 * Dig Deep's data: positions from the Lichess databases (fetched once, kept
 * in memory and in the database, served stale when Lichess can't answer) and
 * from ChessMate's own games (counted as games finish).
 */
export class ExplorerService {
  private readonly memory = new Map<string, Cached>();
  private readonly inFlight = new Map<string, Promise<{ position: ExplorerPosition; stale: boolean }>>();
  private readonly theoryMemo = new Map<string, Promise<{ plies: number; certain: boolean }>>();
  private readonly db: Database | null;
  private readonly lichess: LichessExplorer | null;
  private readonly now: () => number;
  private readonly log: (msg: string, e?: unknown) => void;
  /** Games that end after this were counted as they finished (see `backfill`). */
  private readonly startedAt: number;

  constructor(opts: ExplorerServiceOptions = {}) {
    this.db = opts.db ?? null;
    this.lichess = opts.lichess ?? null;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((msg, e) => console.warn(`[explorer] ${msg}`, e ?? ''));
    this.startedAt = this.now();
  }

  /** True when the Lichess collections can be fetched (a token is set). */
  get lichessConfigured(): boolean {
    return !!this.lichess?.configured;
  }

  /**
   * One position in one collection. `stale` is true when Lichess could not
   * answer and an older answer was served instead. Throws ExplorerError when
   * there is nothing to serve.
   */
  position(source: ExplorerSource, fen: string, filters?: ExplorerFilters): Promise<{ position: ExplorerPosition; stale: boolean }> {
    const key = explorerCacheKey(source, fen, source === 'lichess' ? filters : undefined);
    const fresh = this.fromMemory(key, source);
    if (fresh) return Promise.resolve({ position: fresh, stale: false });
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = (source === 'chessmate' ? this.chessmate(fen).then((position) => ({ position, stale: false })) : this.fromLichess(source, fen, filters, key))
      .then((r) => {
        if (!r.stale) this.remember(key, r.position);
        return r;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  /**
   * How many opening moves of a game are theory by the masters' games (core
   * `theoryPlies`). Zero when the masters database can't be reached: reviews
   * then use the named openings alone.
   */
  async theoryPlies(initialFen: string, moves: string[]): Promise<number> {
    return (await this.theory(initialFen, moves)).plies;
  }

  /** `theoryPlies`, and whether every lookup it needed succeeded (only then is the answer worth caching). */
  theory(initialFen: string, moves: string[]): Promise<{ plies: number; certain: boolean }> {
    const plies = moves.slice(0, EXPLORER_MAX_PLY);
    const key = `${initialFen}|${plies.join(',')}`;
    const known = this.theoryMemo.get(key);
    if (known) return known;
    let certain = true;
    const p = theoryPlies(
      plies,
      (fen) =>
        this.position('masters', fen).then(
          (r) => {
            if (r.stale) certain = false;
            return r.position;
          },
          () => {
            certain = false;
            return null;
          },
        ),
      initialFen,
    )
      .catch(() => {
        certain = false;
        return 0;
      })
      .then((n) => ({ plies: n, certain }));
    this.theoryMemo.set(key, p);
    void p.then((r) => {
      if (!r.certain) this.theoryMemo.delete(key);
      else if (this.theoryMemo.size > MEMORY_THEORY) this.theoryMemo.delete(this.theoryMemo.keys().next().value!);
    });
    return p;
  }

  /** Counts a finished game in the ChessMate collection. */
  async recordGame(game: ExplorerGame): Promise<void> {
    if (!this.db || game.moves.length < 2) return;
    const tallies = explorerTallies(game.moves, game.initialFen);
    if (!tallies.length) return;
    const r = game.ratings;
    await addExplorerGame(
      this.db,
      tallies.map((t) => ({ position: t.key, uci: t.uci, san: t.san })),
      { winner: game.winner, averageRating: r && Number.isFinite(r.w) && Number.isFinite(r.b) ? (r.w + r.b) / 2 : null },
    );
    // Positions this game passed through show its result from now on.
    for (const t of tallies) this.memory.delete(`chessmate|${t.key}`);
  }

  /**
   * Counts the games that finished before the explorer existed, a page at a
   * time, once. Resumes after a restart; games that finish while it runs are
   * counted as they finish, never twice.
   */
  async backfill(pauseMs = 50): Promise<number> {
    if (!this.db) return 0;
    let state = await getAppSetting<BackfillState>(this.db, BACKFILL_KEY);
    if (state?.done) return 0;
    state ??= { cutoff: new Date(this.startedAt).toISOString(), cursor: null, done: false };
    await setAppSetting(this.db, BACKFILL_KEY, state);
    let counted = 0;
    for (;;) {
      const page = await explorerBackfillPage(this.db, {
        startFen: START_FEN,
        cursor: state.cursor,
        until: new Date(state.cutoff),
        limit: BACKFILL_PAGE,
        plies: EXPLORER_MAX_PLY,
      });
      if (!page.cursor) break;
      for (const g of page.games) {
        await this.recordGame({
          initialFen: START_FEN,
          moves: g.moves,
          winner: g.winner,
          ratings: g.whiteRating !== null && g.blackRating !== null ? { w: g.whiteRating, b: g.blackRating } : null,
        });
        counted++;
      }
      state = { ...state, cursor: page.cursor };
      await setAppSetting(this.db, BACKFILL_KEY, state);
      if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
    }
    await setAppSetting(this.db, BACKFILL_KEY, { ...state, done: true });
    return counted;
  }

  /** Keeps the database cache bounded. */
  async prune(): Promise<number> {
    if (!this.db) return 0;
    return pruneExplorerCache(this.db, new Date(this.now() - KEEP_CACHE_MS), KEEP_CACHE_ROWS);
  }

  private fromMemory(key: string, source: ExplorerSource): ExplorerPosition | null {
    const hit = this.memory.get(key);
    if (!hit) return null;
    const ttl = source === 'chessmate' ? CHESSMATE_FRESH_MS : FRESH_MS[source];
    if (this.now() - hit.at > ttl) return null;
    // Most recently used last.
    this.memory.delete(key);
    this.memory.set(key, hit);
    return hit.position;
  }

  private remember(key: string, position: ExplorerPosition, at = this.now()) {
    this.memory.delete(key);
    this.memory.set(key, { position, at });
    while (this.memory.size > MEMORY_POSITIONS) this.memory.delete(this.memory.keys().next().value!);
  }

  private async fromLichess(
    source: 'lichess' | 'masters',
    fen: string,
    filters: ExplorerFilters | undefined,
    key: string,
  ): Promise<{ position: ExplorerPosition; stale: boolean }> {
    const ttl = FRESH_MS[source];
    let stored: { body: unknown; fetchedAt: Date } | null = null;
    if (this.db) {
      try {
        stored = await cachedExplorer(this.db, key);
      } catch (e) {
        this.log('cache read failed', e);
      }
      const position = stored && asPosition(stored.body, source);
      if (stored && position && this.now() - stored.fetchedAt.getTime() <= ttl) {
        this.remember(key, position, stored.fetchedAt.getTime());
        return { position, stale: false };
      }
    }
    const stale = (): ExplorerPosition | null => (stored && asPosition(stored.body, source)) || this.memory.get(key)?.position || null;
    if (!this.lichess) {
      const old = stale();
      if (old) return { position: old, stale: true };
      throw new ExplorerError('not_configured', 'The Lichess database is not connected on this server');
    }
    let raw: unknown;
    try {
      raw = await this.lichess.fetch(source, fen, source === 'lichess' ? normalizeExplorerFilters(filters) : undefined);
    } catch (e) {
      const old = stale();
      if (old) return { position: old, stale: true };
      throw e;
    }
    const position = parseLichessExplorer(fen, source, raw);
    if (!position) {
      const old = stale();
      if (old) return { position: old, stale: true };
      throw new ExplorerError('unavailable', 'Lichess explorer sent an answer we could not read');
    }
    if (this.db) await storeExplorer(this.db, key, position, new Date(this.now())).catch((e) => this.log('cache write failed', e));
    return { position, stale: false };
  }

  private async chessmate(fen: string): Promise<ExplorerPosition> {
    const key = explorerKey(fen);
    const empty: ExplorerPosition = { source: 'chessmate', key, white: 0, draws: 0, black: 0, moves: [], opening: lookupOpening(fen) };
    if (!this.db) return empty;
    const [rows, totals] = await Promise.all([explorerMovesAt(this.db, key, EXPLORER_MAX_MOVES), explorerTotalsAt(this.db, key)]);
    return {
      ...empty,
      ...totals,
      moves: rows.map((r) => ({
        uci: r.uci,
        san: r.san,
        white: r.white,
        draws: r.draws,
        black: r.black,
        averageRating: r.ratedGames > 0 ? Math.round(Number(r.ratingSum) / r.ratedGames) : null,
      })),
    };
  }
}

/** A cached answer as we stored it (a parsed position), or null when it isn't one. */
function asPosition(body: unknown, source: 'lichess' | 'masters'): ExplorerPosition | null {
  if (!body || typeof body !== 'object') return null;
  const p = body as ExplorerPosition;
  if (p.source !== source || typeof p.key !== 'string' || !Array.isArray(p.moves)) return null;
  return p;
}
