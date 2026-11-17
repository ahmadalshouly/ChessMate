import { DEFAULT_AVATAR, normalizeSettings, type Avatar } from '@chessmate/core';
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
  updated_at INTEGER NOT NULL
);`;

/** Profile rows in their own table, keyed by user id, on a shared SQLite connection. */
export class SqliteProfileStore implements ProfileStore {
  constructor(private readonly sql: SqlConnection) {
    sql.exec(SCHEMA);
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
      settings: normalizeSettings(parse(r.settings, {})),
      updatedAt: r.updated_at as number,
    };
  }

  save(p: ProfileRecord): void {
    this.sql
      .prepare(
        `INSERT INTO user_profiles (user_id, display_name, bio, country, avatar, settings, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, bio = excluded.bio, country = excluded.country,
           avatar = excluded.avatar, settings = excluded.settings, updated_at = excluded.updated_at`,
      )
      .run(p.userId, p.displayName, p.bio, p.country, JSON.stringify(p.avatar), JSON.stringify(p.settings), p.updatedAt);
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
