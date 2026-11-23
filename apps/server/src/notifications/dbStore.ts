import { defaultNotificationPrefs, mergeNotificationPrefs, type NotificationPrefs } from '@chessmate/core';
import {
  deleteNotification,
  deletePushToken,
  insertNotification,
  loadNotificationState,
  markNotificationsRead,
  pruneNotifications,
  upsertNotificationPrefs,
  upsertPushToken,
  type Database,
} from '@chessmate/db';
import { MAX_PER_USER, MemoryNotificationStore, type NotificationStore, type PushTokenRow, type StoredNotification } from './store';

/** Inbox entries older than this are dropped from the database and not loaded at startup. */
export const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60_000;

/**
 * Postgres-backed notification store. Reads come from an in-memory copy
 * (the NotificationStore interface is synchronous and sits on hot paths such
 * as every move's "your turn"); every change is also written to the database
 * in the background, so notifications, preferences and push tokens survive
 * restarts and deploys.
 *
 * Writes for one user run in order (an insert lands before the "mark read"
 * that follows it); different users write in parallel. A failed write is
 * logged and the in-memory copy stays correct until the next restart.
 */
export class DbNotificationStore extends MemoryNotificationStore implements NotificationStore {
  private queues = new Map<string, Promise<void>>();

  private constructor(
    private readonly db: Database,
    private readonly log: (msg: string) => void,
  ) {
    super();
  }

  static async load(db: Database, opts: { now?: number; log?: (msg: string) => void } = {}): Promise<DbNotificationStore> {
    const store = new DbNotificationStore(db, opts.log ?? ((m) => console.warn(m)));
    const since = new Date((opts.now ?? Date.now()) - NOTIFICATION_RETENTION_MS);
    await pruneNotifications(db, since);
    const state = await loadNotificationState(db, { since, perUser: MAX_PER_USER });
    // Oldest first, so the newest ends up on top as in live use.
    for (const r of [...state.notifications].reverse()) {
      MemoryNotificationStore.prototype.add.call(store, {
        id: r.id,
        userId: r.userId,
        kind: r.kind as StoredNotification['kind'],
        title: r.title,
        body: r.body,
        url: r.url,
        data: r.data,
        collapseKey: r.collapseKey,
        createdAt: r.createdAt.getTime(),
        readAt: r.readAt ? r.readAt.getTime() : null,
      });
    }
    // Merged over defaults so kinds added since they were saved get sensible values.
    for (const p of state.prefs) MemoryNotificationStore.prototype.savePrefs.call(store, p.userId, mergeNotificationPrefs(defaultNotificationPrefs(), p.prefs));
    for (const t of state.tokens) {
      MemoryNotificationStore.prototype.addPushToken.call(store, { token: t.token, userId: t.userId, platform: t.platform, updatedAt: t.updatedAt.getTime() });
    }
    return store;
  }

  /** Resolves once every write queued so far is in the database (shutdown, tests). */
  async flush(): Promise<void> {
    while (this.queues.size) await Promise.all([...this.queues.values()]);
  }

  override add(n: StoredNotification) {
    super.add(n);
    this.write(n.userId, () =>
      insertNotification(
        this.db,
        {
          id: n.id,
          userId: n.userId,
          kind: n.kind,
          title: n.title,
          body: n.body,
          url: n.url,
          data: n.data,
          collapseKey: n.collapseKey,
          createdAt: new Date(n.createdAt),
          readAt: n.readAt === null ? null : new Date(n.readAt),
        },
        MAX_PER_USER,
      ),
    );
  }

  override markRead(userId: string, ids: string[] | 'all', now: number) {
    const changed = super.markRead(userId, ids, now);
    if (changed > 0) this.write(userId, () => markNotificationsRead(this.db, userId, ids, new Date(now)));
    return changed;
  }

  override remove(userId: string, id: string) {
    const removed = super.remove(userId, id);
    if (removed) this.write(userId, () => deleteNotification(this.db, userId, id));
    return removed;
  }

  override savePrefs(userId: string, prefs: NotificationPrefs) {
    super.savePrefs(userId, prefs);
    this.write(userId, () => upsertNotificationPrefs(this.db, userId, prefs));
  }

  override addPushToken(row: PushTokenRow) {
    super.addPushToken(row);
    this.write(row.userId, () => upsertPushToken(this.db, { token: row.token, userId: row.userId, platform: row.platform, updatedAt: new Date(row.updatedAt) }));
  }

  override removePushToken(token: string, userId?: string) {
    super.removePushToken(token, userId);
    this.write(userId ?? `token:${token}`, () => deletePushToken(this.db, token, userId));
  }

  private write(key: string, op: () => Promise<unknown>) {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev
      .then(op)
      .then(() => undefined)
      .catch((e: unknown) => {
        // Ids without an account row (development "dev:" players) can't be stored; that's expected.
        if (foreignKeyViolation(e)) return;
        this.log(`notification store write failed: ${e instanceof Error ? e.message : String(e)}`);
      });
    this.queues.set(key, next);
    void next.then(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    });
  }
}

function foreignKeyViolation(e: unknown): boolean {
  for (let cur: unknown = e; cur && typeof cur === 'object'; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === '23503') return true;
  }
  return false;
}
