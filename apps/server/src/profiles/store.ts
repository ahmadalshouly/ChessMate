import { DEFAULT_AVATAR, isFootballClubId, isPlayerTag, normalizeSettings, type Avatar } from '@chessmate/core';
import { allProfiles, deleteProfile, upsertProfile, type Database } from '@chessmate/db';
import type { ProfileRecord, ProfileStore } from './types';

export class MemoryProfileStore implements ProfileStore {
  private rows = new Map<string, ProfileRecord>();
  get(userId: string) {
    const r = this.rows.get(userId);
    return r && structuredClone(r);
  }
  save(record: ProfileRecord) {
    this.rows.set(record.userId, structuredClone(record));
  }
  delete(userId: string) {
    this.rows.delete(userId);
  }
}

/** Minimal slice of node:sqlite's DatabaseSync, so callers pass their own connection. */
export interface SqlConnection {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: (string | number | null)[]): unknown;
    get(...params: (string | number | null)[]): unknown;
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  bio TEXT,
  country TEXT,
  avatar TEXT NOT NULL,
  settings TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  player_tag TEXT,
  football_club TEXT
);`;

/** Columns added after the table first shipped; added to older files when the store opens. */
const ADDED_COLUMNS = ['player_tag TEXT', 'football_club TEXT'];

/** Profile rows in their own table, keyed by user id, on a shared SQLite connection. */
export class SqliteProfileStore implements ProfileStore {
  constructor(private readonly sql: SqlConnection) {
    sql.exec(SCHEMA);
    for (const col of ADDED_COLUMNS) {
      try {
        sql.exec(`ALTER TABLE user_profiles ADD COLUMN ${col}`);
      } catch {
        // Already there.
      }
    }
  }

  get(userId: string): ProfileRecord | undefined {
    const r = this.sql.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    return {
      userId,
      displayName: (r.display_name as string | null) ?? null,
      bio: (r.bio as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      avatar: parse<Avatar>(r.avatar, DEFAULT_AVATAR),
      playerTag: isPlayerTag(r.player_tag) ? r.player_tag : null,
      footballClub: isFootballClubId(r.football_club) ? r.football_club : null,
      settings: normalizeSettings(parse(r.settings, {})),
      updatedAt: r.updated_at as number,
    };
  }

  save(p: ProfileRecord): void {
    this.sql
      .prepare(
        `INSERT INTO user_profiles (user_id, display_name, bio, country, avatar, settings, updated_at, player_tag, football_club) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, bio = excluded.bio, country = excluded.country,
           avatar = excluded.avatar, settings = excluded.settings, updated_at = excluded.updated_at,
           player_tag = excluded.player_tag, football_club = excluded.football_club`,
      )
      .run(p.userId, p.displayName, p.bio, p.country, JSON.stringify(p.avatar), JSON.stringify(p.settings), p.updatedAt, p.playerTag ?? null, p.footballClub ?? null);
  }

  delete(userId: string): void {
    this.sql.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId);
  }
}

function parse<T>(v: unknown, fallback: T): T {
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Profiles and settings in Postgres (user_profiles), with every row kept in memory
 * so privacy checks on hot paths (presence, challenges, search) stay synchronous.
 * Writes go to memory first, then to the database.
 */
export class DbProfileStore implements ProfileStore {
  private readonly cache = new MemoryProfileStore();

  private constructor(private readonly db: Database) {}

  static async load(db: Database): Promise<DbProfileStore> {
    const store = new DbProfileStore(db);
    for (const r of await allProfiles(db)) {
      store.cache.save({
        userId: r.userId,
        displayName: r.displayName,
        bio: r.bio,
        country: r.country,
        avatar: (r.avatar as Avatar | null) ?? DEFAULT_AVATAR,
        playerTag: isPlayerTag(r.playerTag) ? r.playerTag : null,
        footballClub: isFootballClubId(r.footballClub) ? r.footballClub : null,
        settings: normalizeSettings(r.settings),
        updatedAt: new Date(r.updatedAt).getTime(),
      });
    }
    return store;
  }

  get(userId: string) {
    return this.cache.get(userId);
  }

  async save(p: ProfileRecord) {
    this.cache.save(p);
    await upsertProfile(this.db, {
      userId: p.userId,
      displayName: p.displayName,
      bio: p.bio,
      country: p.country,
      avatar: p.avatar,
      playerTag: p.playerTag ?? null,
      footballClub: p.footballClub ?? null,
      settings: p.settings,
      updatedAt: new Date(p.updatedAt || Date.now()),
    });
  }

  async delete(userId: string) {
    this.cache.delete(userId);
    await deleteProfile(this.db, userId);
  }
}
