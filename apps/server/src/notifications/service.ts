import { inQuietHours, type AppNotification } from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { RecordingPushSender, type PushSender } from './push';
import type { NotificationStore } from './store';
import type { NotifyInput } from './templates';

export interface NotificationServiceOptions {
  store: NotificationStore;
  push?: PushSender;
  /** Realtime delivery to the user's open app sessions (WebSocket). */
  deliver?: (userId: string, n: AppNotification, unread: number) => void;
  /** True while the user has the app open; push is skipped then because in-app delivery already reached them. */
  isOnline?: (userId: string) => boolean;
  now?: () => number;
  log?: (msg: string) => void;
}

/**
 * Single entry point for every feature that notifies a user. Applies the
 * user's preferences, stores the in-app copy, delivers it live and sends a
 * push to their devices when they are away.
 */
export class NotificationService {
  readonly store: NotificationStore;
  private readonly push: PushSender;
  private readonly now: () => number;
  /** Pending push sends, so tests and shutdown can wait for them. */
  private inflight = new Set<Promise<unknown>>();

  constructor(private opts: NotificationServiceOptions) {
    this.store = opts.store;
    this.push = opts.push ?? new RecordingPushSender();
    this.now = opts.now ?? Date.now;
  }

  /** Connects live delivery once the realtime server exists (it owns the sockets). */
  attach(hooks: Pick<NotificationServiceOptions, 'deliver' | 'isOnline'>) {
    if (hooks.deliver) this.opts.deliver = hooks.deliver;
    if (hooks.isOnline) this.opts.isOnline = hooks.isOnline;
  }

  /** Returns the stored notification, or null when the user turned this kind off everywhere. */
  notify(userId: string, input: NotifyInput): AppNotification | null {
    const prefs = this.store.prefs(userId);
    const channel = prefs.kinds[input.kind] ?? { inApp: true, push: true };
    const now = this.now();
    const n: AppNotification = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 400),
      url: input.url ?? null,
      data: input.data ?? {},
      createdAt: now,
      readAt: null,
    };
    if (channel.inApp) {
      this.store.add({ ...n, userId, collapseKey: input.collapseKey ?? null });
      this.opts.deliver?.(userId, n, this.store.unreadCount(userId));
    }
    const online = this.opts.isOnline?.(userId) ?? false;
    if (channel.push && !online && !inQuietHours(prefs.quietHours, now)) this.sendPush(userId, n, input.collapseKey);
    return channel.inApp || channel.push ? n : null;
  }

  private sendPush(userId: string, n: AppNotification, collapseKey?: string) {
    const tokens = this.store.pushTokens(userId);
    if (tokens.length === 0) return;
    const badge = this.store.unreadCount(userId);
    const p = this.push
      .send(
        tokens.map((t) => ({
          to: t.token,
          title: n.title,
          body: n.body,
          data: { id: n.id, kind: n.kind, url: n.url, ...n.data },
          sound: 'default' as const,
          badge,
          channelId: 'default',
          threadId: collapseKey,
        })),
      )
      .then((r) => {
        for (const token of r.invalidTokens) this.store.removePushToken(token);
      })
      .catch((e: unknown) => this.opts.log?.(`push error: ${String(e)}`))
      .finally(() => this.inflight.delete(p));
    this.inflight.add(p);
  }

  /** Resolves once every queued push has been handed to Expo. */
  async flush(): Promise<void> {
    while (this.inflight.size) await Promise.all([...this.inflight]);
  }
}
