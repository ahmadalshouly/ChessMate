import { defaultNotificationPrefs, mergeNotificationPrefs, type AppNotification, type NotificationPrefs } from '@chessmate/core';
import type { DatabaseSync } from 'node:sqlite';

/** Per-user cap; older notifications are pruned when new ones arrive. */
export const MAX_PER_USER = 200;

export interface StoredNotification extends AppNotification {
  userId: string;
  /** Notifications with the same key replace each other while unread (e.g. one "your turn" per game). */
  collapseKey: string | null;
}

export interface PushTokenRow {
  token: string;
  userId: string;
  platform: string;
  updatedAt: number;
}

/**
 * Storage boundary for notifications, preferences and push tokens. Sync on
 * purpose: reads sit on hot paths. The Postgres store (dbStore.ts) serves
 * reads from memory and writes through in the background.
 */
export interface NotificationStore {
  add(n: StoredNotification): void;
  list(userId: string, opts?: { limit?: number; before?: number }): AppNotification[];
  unreadCount(userId: string): number;
  markRead(userId: string, ids: string[] | 'all', now: number): number;
  remove(userId: string, id: string): boolean;
  prefs(userId: string): NotificationPrefs;
  savePrefs(userId: string, prefs: NotificationPrefs): void;
  addPushToken(row: PushTokenRow): void;
  removePushToken(token: string, userId?: string): void;
  pushTokens(userId: string): PushTokenRow[];
  /** Waits for pending background writes (stores that persist asynchronously). */
  flush?(): Promise<void>;
}

const strip = ({ userId: _u, collapseKey: _c, ...n }: StoredNotification): AppNotification => n;

export class MemoryNotificationStore implements NotificationStore {
  private items = new Map<string, StoredNotification[]>();
  private prefMap = new Map<string, NotificationPrefs>();
  private tokens = new Map<string, PushTokenRow>();

  add(n: StoredNotification) {
    let list = this.items.get(n.userId) ?? [];
    if (n.collapseKey) list = list.filter((x) => x.readAt !== null || x.collapseKey !== n.collapseKey);
    list.unshift(n);
    this.items.set(n.userId, list.slice(0, MAX_PER_USER));
  }
  list(userId: string, { limit = 50, before = Number.MAX_SAFE_INTEGER } = {}) {
    return (this.items.get(userId) ?? []).filter((n) => n.createdAt < before).slice(0, limit).map(strip);
  }
  unreadCount(userId: string) {
    return (this.items.get(userId) ?? []).filter((n) => n.readAt === null).length;
  }
  markRead(userId: string, ids: string[] | 'all', now: number) {
    let changed = 0;
    for (const n of this.items.get(userId) ?? []) {
      if (n.readAt === null && (ids === 'all' || ids.includes(n.id))) {
        n.readAt = now;
        changed++;
      }
    }
    return changed;
  }
  remove(userId: string, id: string) {
    const list = this.items.get(userId) ?? [];
    const next = list.filter((n) => n.id !== id);
    this.items.set(userId, next);
    return next.length !== list.length;
  }
  prefs(userId: string) {
    return this.prefMap.get(userId) ?? defaultNotificationPrefs();
  }
  savePrefs(userId: string, prefs: NotificationPrefs) {
    this.prefMap.set(userId, prefs);
  }
  addPushToken(row: PushTokenRow) {
    this.tokens.set(row.token, row);
  }
  removePushToken(token: string, userId?: string) {
    const row = this.tokens.get(token);
    if (row && (!userId || row.userId === userId)) this.tokens.delete(token);
  }
  pushTokens(userId: string) {
    return [...this.tokens.values()].filter((t) => t.userId === userId);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  data TEXT NOT NULL,
  collapse_key TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY,
  prefs TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_tokens_user ON push_tokens(user_id);
`;

type Row = Record<string, unknown>;
const toNotification = (r: Row): AppNotification => ({
  id: r.id as string,
  kind: r.kind as AppNotification['kind'],
  title: r.title as string,
  body: r.body as string,
  url: (r.url as string | null) ?? null,
  data: JSON.parse(r.data as string) as Record<string, string>,
  createdAt: r.created_at as number,
  readAt: (r.read_at as number | null) ?? null,
});

/**
 * SQLite store. Pass the accounts database's `DatabaseSync` so everything
 * lives in one file; the tables are created if missing.
 */
export class SqliteNotificationStore implements NotificationStore {
  constructor(private readonly sql: DatabaseSync) {
    sql.exec(SCHEMA);
  }

  add(n: StoredNotification) {
    if (n.collapseKey) {
      this.sql.prepare('DELETE FROM notifications WHERE user_id = ? AND collapse_key = ? AND read_at IS NULL').run(n.userId, n.collapseKey);
    }
    this.sql
      .prepare('INSERT INTO notifications (id, user_id, kind, title, body, url, data, collapse_key, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(n.id, n.userId, n.kind, n.title, n.body, n.url, JSON.stringify(n.data), n.collapseKey, n.createdAt, n.readAt);
    this.sql
      .prepare(
        `DELETE FROM notifications WHERE user_id = ? AND id NOT IN
           (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`,
      )
      .run(n.userId, n.userId, MAX_PER_USER);
  }
  list(userId: string, { limit = 50, before = Number.MAX_SAFE_INTEGER } = {}) {
    return (
      this.sql.prepare('SELECT * FROM notifications WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?').all(userId, before, limit) as Row[]
    ).map(toNotification);
  }
  unreadCount(userId: string) {
    const r = this.sql.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId) as Row;
    return Number(r.c);
  }
  markRead(userId: string, ids: string[] | 'all', now: number) {
    if (ids === 'all') {
      return Number(this.sql.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, userId).changes);
    }
    let changed = 0;
    const stmt = this.sql.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL');
    for (const id of ids) changed += Number(stmt.run(now, userId, id).changes);
    return changed;
  }
  remove(userId: string, id: string) {
    return Number(this.sql.prepare('DELETE FROM notifications WHERE user_id = ? AND id = ?').run(userId, id).changes) > 0;
  }
  prefs(userId: string) {
    const r = this.sql.prepare('SELECT prefs FROM notification_prefs WHERE user_id = ?').get(userId) as Row | undefined;
    // Merge over defaults so kinds added later get sensible values.
    return r ? mergeNotificationPrefs(defaultNotificationPrefs(), JSON.parse(r.prefs as string)) : defaultNotificationPrefs();
  }
  savePrefs(userId: string, prefs: NotificationPrefs) {
    this.sql
      .prepare('INSERT INTO notification_prefs (user_id, prefs) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs')
      .run(userId, JSON.stringify(prefs));
  }
  addPushToken(row: PushTokenRow) {
    this.sql
      .prepare(
        `INSERT INTO push_tokens (token, user_id, platform, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at`,
      )
      .run(row.token, row.userId, row.platform, row.updatedAt);
  }
  removePushToken(token: string, userId?: string) {
    if (userId) this.sql.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(token, userId);
    else this.sql.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
  }
  pushTokens(userId: string) {
    return (this.sql.prepare('SELECT * FROM push_tokens WHERE user_id = ?').all(userId) as Row[]).map((r) => ({
      token: r.token as string,
      userId: r.user_id as string,
      platform: r.platform as string,
      updatedAt: r.updated_at as number,
    }));
  }
}
