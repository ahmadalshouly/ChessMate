import { DEFAULT_PUZZLE_RATING, hash32, type Puzzle, type PuzzleRunMode, type Rating } from '@chessmate/core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface PuzzleRatingRow extends Rating {
  attempts: number;
  solved: number;
}

export interface PuzzleQuery {
  /** Aim for puzzles near this rating. */
  rating: number;
  /** Half-width of the first rating window tried; widens if nothing is found. */
  window?: number;
  theme?: string;
  /** Puzzle ids to skip (already seen). */
  exclude?: Set<string>;
  /** 0..1 random source, injectable for tests. */
  random?: () => number;
}

/**
 * Storage boundary for puzzles. The columns mirror the shared Postgres
 * schema (@chessmate/db: puzzles, puzzle_attempts, ratings category
 * 'puzzle'), so a Postgres implementation is a straight port of this class.
 */
export interface PuzzleStore {
  count(): number;
  insertMany(puzzles: Puzzle[], source?: string): number;
  get(id: string): Puzzle | undefined;
  pick(q: PuzzleQuery): Puzzle | undefined;
  /** Puzzles near a rating ladder, one per target, without repeats. */
  ladder(targets: number[], random?: () => number): Puzzle[];
  daily(day: string): Puzzle | undefined;
  themeCounts(): Record<string, number>;
  rating(userId: string): PuzzleRatingRow;
  recordAttempt(a: { userId: string; puzzleId: string; solved: boolean; rated: boolean; before: number; after: number; timeMs: number | null; at: number }): void;
  saveRating(userId: string, r: Rating, solved: boolean): void;
  recentPuzzleIds(userId: string, limit: number): Set<string>;
  hasAttempted(userId: string, puzzleId: string): boolean;
  recordRun(userId: string, mode: PuzzleRunMode, score: number, at: number): void;
  bestRun(userId: string, mode: PuzzleRunMode): number;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'lichess',
  fen TEXT NOT NULL,
  moves TEXT NOT NULL,
  rating INTEGER NOT NULL,
  rd INTEGER NOT NULL,
  popularity INTEGER NOT NULL,
  plays INTEGER NOT NULL,
  themes TEXT NOT NULL,
  game_url TEXT,
  opening_tags TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS puzzles_rating ON puzzles(rating);
CREATE TABLE IF NOT EXISTS puzzle_themes (
  theme TEXT NOT NULL,
  rating INTEGER NOT NULL,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  PRIMARY KEY (theme, rating, puzzle_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS puzzle_ratings (
  user_id TEXT PRIMARY KEY,
  rating REAL NOT NULL,
  rd REAL NOT NULL,
  volatility REAL NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  solved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  solved INTEGER NOT NULL,
  rated INTEGER NOT NULL,
  rating_before INTEGER NOT NULL,
  rating_after INTEGER NOT NULL,
  time_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS puzzle_attempts_user ON puzzle_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS puzzle_attempts_user_puzzle ON puzzle_attempts(user_id, puzzle_id);
CREATE TABLE IF NOT EXISTS puzzle_runs (
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS puzzle_runs_best ON puzzle_runs(user_id, mode, score DESC);
`;

type Row = Record<string, unknown>;

function toPuzzle(r: Row): Puzzle {
  return {
    id: r.id as string,
    fen: r.fen as string,
    moves: (r.moves as string).split(' '),
    rating: r.rating as number,
    ratingDeviation: r.rd as number,
    popularity: r.popularity as number,
    plays: r.plays as number,
    themes: (r.themes as string).split(' ').filter(Boolean),
    gameUrl: (r.game_url as string | null) || null,
    openingTags: ((r.opening_tags as string) ?? '').split(' ').filter(Boolean),
  };
}

/** SQLite implementation (node:sqlite, no native addon). */
export class SqlitePuzzleStore implements PuzzleStore {
  readonly sql: DatabaseSync;

  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
    this.sql.exec(SCHEMA);
  }

  close() {
    this.sql.close();
  }

  count(): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as { n: number }).n;
  }

  /** Upserts in one transaction; returns how many rows were written. */
  insertMany(puzzles: Puzzle[], source = 'lichess'): number {
    const put = this.sql.prepare(
      `INSERT INTO puzzles (id, source, fen, moves, rating, rd, popularity, plays, themes, game_url, opening_tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, rd = excluded.rd, popularity = excluded.popularity,
         plays = excluded.plays, themes = excluded.themes`,
    );
    const clearThemes = this.sql.prepare('DELETE FROM puzzle_themes WHERE puzzle_id = ?');
    const putTheme = this.sql.prepare('INSERT OR IGNORE INTO puzzle_themes (theme, rating, puzzle_id) VALUES (?, ?, ?)');
    this.sql.exec('BEGIN');
    try {
      for (const p of puzzles) {
        put.run(p.id, source, p.fen, p.moves.join(' '), Math.round(p.rating), Math.round(p.ratingDeviation), p.popularity, p.plays, p.themes.join(' '), p.gameUrl, p.openingTags.join(' '));
        clearThemes.run(p.id);
        for (const t of p.themes) putTheme.run(t, Math.round(p.rating), p.id);
      }
      this.sql.exec('COMMIT');
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }
    return puzzles.length;
  }

  get(id: string): Puzzle | undefined {
    const r = this.sql.prepare('SELECT * FROM puzzles WHERE id = ?').get(id) as Row | undefined;
    return r ? toPuzzle(r) : undefined;
  }

  /**
   * Random puzzle in a rating window around the target, widening the window
   * until something unseen turns up. Random offset into an indexed range
   * keeps this fast on the full database (millions of rows).
   */
  pick(q: PuzzleQuery): Puzzle | undefined {
    const random = q.random ?? Math.random;
    const exclude = q.exclude ?? new Set<string>();
    for (const w of [q.window ?? 100, 250, 500, 1000, 4000]) {
      const lo = q.rating - w;
      const hi = q.rating + w;
      const [countSql, rowSql, args] = q.theme
        ? [
            'SELECT COUNT(*) AS n FROM puzzle_themes WHERE theme = ? AND rating BETWEEN ? AND ?',
            'SELECT p.* FROM puzzle_themes t JOIN puzzles p ON p.id = t.puzzle_id WHERE t.theme = ? AND t.rating BETWEEN ? AND ? ORDER BY t.rating, t.puzzle_id LIMIT ? OFFSET ?',
            [q.theme, lo, hi],
          ]
        : [
            'SELECT COUNT(*) AS n FROM puzzles WHERE rating BETWEEN ? AND ?',
            'SELECT * FROM puzzles WHERE rating BETWEEN ? AND ? ORDER BY rating, id LIMIT ? OFFSET ?',
            [lo, hi],
          ];
      const n = (this.sql.prepare(countSql).get(...args) as { n: number }).n;
      if (n === 0) continue;
      // Read a small page from a random offset and take the first unseen.
      const page = 24;
      const offset = Math.floor(random() * Math.max(1, n - page + 1));
      const rows = this.sql.prepare(rowSql).all(...args, page, offset) as Row[];
      const hit = rows.find((r) => !exclude.has(r.id as string));
      if (hit) return toPuzzle(hit);
    }
    return undefined;
  }

  ladder(targets: number[], random: () => number = Math.random): Puzzle[] {
    const seen = new Set<string>();
    const out: Puzzle[] = [];
    for (const rating of targets) {
      const p = this.pick({ rating, window: 60, exclude: seen, random });
      if (!p) break;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }

  /**
   * Daily puzzle: a popular, well-tested puzzle of moderate difficulty,
   * chosen deterministically from the date so every player gets the same one.
   */
  daily(day: string): Puzzle | undefined {
    const where = 'rating BETWEEN 1400 AND 2100 AND popularity >= 80 AND plays >= 1000';
    let n = (this.sql.prepare(`SELECT COUNT(*) AS n FROM puzzles WHERE ${where}`).get() as { n: number }).n;
    let sql = `SELECT * FROM puzzles WHERE ${where} ORDER BY id LIMIT 1 OFFSET ?`;
    if (n === 0) {
      // Small databases (e.g. the dev seed): fall back to any puzzle.
      n = this.count();
      sql = 'SELECT * FROM puzzles ORDER BY id LIMIT 1 OFFSET ?';
    }
    if (n === 0) return undefined;
    const r = this.sql.prepare(sql).get(hash32(`daily:${day}`) % n) as Row | undefined;
    return r ? toPuzzle(r) : undefined;
  }

  themeCounts(): Record<string, number> {
    const rows = this.sql.prepare('SELECT theme, COUNT(*) AS n FROM puzzle_themes GROUP BY theme').all() as { theme: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.theme, r.n]));
  }

  rating(userId: string): PuzzleRatingRow {
    const r = this.sql.prepare('SELECT * FROM puzzle_ratings WHERE user_id = ?').get(userId) as Row | undefined;
    if (!r) return { ...DEFAULT_PUZZLE_RATING, attempts: 0, solved: 0 };
    return { rating: r.rating as number, rd: r.rd as number, volatility: r.volatility as number, attempts: r.attempts as number, solved: r.solved as number };
  }

  saveRating(userId: string, r: Rating, solved: boolean): void {
    this.sql
      .prepare(
        `INSERT INTO puzzle_ratings (user_id, rating, rd, volatility, attempts, solved) VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, rd = excluded.rd, volatility = excluded.volatility,
           attempts = attempts + 1, solved = solved + excluded.solved`,
      )
      .run(userId, r.rating, r.rd, r.volatility, solved ? 1 : 0);
  }

  recordAttempt(a: { userId: string; puzzleId: string; solved: boolean; rated: boolean; before: number; after: number; timeMs: number | null; at: number }): void {
    this.sql
      .prepare(
        'INSERT INTO puzzle_attempts (user_id, puzzle_id, solved, rated, rating_before, rating_after, time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(a.userId, a.puzzleId, a.solved ? 1 : 0, a.rated ? 1 : 0, Math.round(a.before), Math.round(a.after), a.timeMs, a.at);
  }

  recentPuzzleIds(userId: string, limit: number): Set<string> {
    const rows = this.sql.prepare('SELECT puzzle_id FROM puzzle_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as { puzzle_id: string }[];
    return new Set(rows.map((r) => r.puzzle_id));
  }

  hasAttempted(userId: string, puzzleId: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM puzzle_attempts WHERE user_id = ? AND puzzle_id = ? LIMIT 1').get(userId, puzzleId);
  }

  recordRun(userId: string, mode: PuzzleRunMode, score: number, at: number): void {
    this.sql.prepare('INSERT INTO puzzle_runs (user_id, mode, score, created_at) VALUES (?, ?, ?, ?)').run(userId, mode, score, at);
  }

  bestRun(userId: string, mode: PuzzleRunMode): number {
    const r = this.sql.prepare('SELECT MAX(score) AS best FROM puzzle_runs WHERE user_id = ? AND mode = ?').get(userId, mode) as { best: number | null };
    return r.best ?? 0;
  }
}
