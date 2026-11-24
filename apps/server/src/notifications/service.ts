import { inQuietHours, type AppNotification } from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { RecordingPushSender, type PushMessage, type PushSender } from './push';
import type { NotificationStore } from './store';
import type { NotifyInput } from './templates';

export interface NotificationServiceOptions {
  store: NotificationStore;
  push?: PushSender;
  /** Realtime delivery to the user's open app sessions (WebSocket). */
  deliver?: (userId: string, n: AppNotification, unread: number) => void;
  /**
   * True while the user has the app open in the foreground; push is skipped
   * then because in-app delivery already reached them.
   */
  isOnline?: (userId: string) => boolean;
  now?: () => number;
  log?: (msg: string) => void;
  /** How long to gather pushes into one Expo request. */
  batchMs?: number;
}

/** Which channels to use for one notification; defaults follow the user's preferences. */
export interface DeliverOptions {
  inApp?: boolean;
  push?: boolean;
}

export interface DeliverOutcome {
  notification: AppNotification | null;
  inApp: boolean;
  /** sent: Expo accepted it for at least one device. skipped: opted out, quiet hours, app open, or no device. */
  push: 'sent' | 'failed' | 'skipped';
}

const BATCH = 100;

/**
 * Single entry point for every feature that notifies a user. Applies the
 * user's preferences, stores the in-app copy, delivers it live and sends a
 * push to their devices when they are away.
 *
 * Pushes from many notify calls in the same moment (a campaign to thousands
 * of players, a tournament round) are gathered into requests of 100, as Expo
 * asks.
 */
export class NotificationService {
  readonly store: NotificationStore;
  private readonly push: PushSender;
  private readonly now: () => number;
  /** Pending push sends, so tests and shutdown can wait for them. */
  private inflight = new Set<Promise<unknown>>();
  private queue: { msg: PushMessage; done: (ok: boolean) => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: NotificationServiceOptions) {
    this.store = opts.store;
    this.push = opts.push ?? new RecordingPushSender();
    this.now = opts.now ?? Date.now;
    // Receipts can report a dead device long after the send.
    this.push.onInvalidToken = (token) => this.store.removePushToken(token);
  }

  get pushSender(): PushSender {
    return this.push;
  }

  /** Connects live delivery once the realtime server exists (it owns the sockets). */
  attach(hooks: Pick<NotificationServiceOptions, 'deliver' | 'isOnline'>) {
    if (hooks.deliver) this.opts.deliver = hooks.deliver;
    if (hooks.isOnline) this.opts.isOnline = hooks.isOnline;
  }

  /** Returns the stored notification, or null when the user turned this kind off everywhere. */
  notify(userId: string, input: NotifyInput): AppNotification | null {
    return this.dispatch(userId, input, {}).notification;
  }

  /** Like notify, with channel overrides, and resolves once the push (if any) was handed to Expo. */
  async deliver(userId: string, input: NotifyInput, opts: DeliverOptions = {}): Promise<DeliverOutcome> {
    const r = this.dispatch(userId, input, opts);
    const push = r.push ? ((await r.push) ? 'sent' : 'failed') : 'skipped';
    return { notification: r.notification, inApp: r.inApp, push };
  }

  private dispatch(userId: string, input: NotifyInput, opts: DeliverOptions): { notification: AppNotification | null; inApp: boolean; push: Promise<boolean> | null } {
    const prefs = this.store.prefs(userId);
    const channel = prefs.kinds[input.kind] ?? { inApp: true, push: true };
    const wantInApp = channel.inApp && opts.inApp !== false;
    const wantPush = channel.push && opts.push !== false;
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
    if (wantInApp) {
      this.store.add({ ...n, userId, collapseKey: input.collapseKey ?? null });
      this.opts.deliver?.(userId, n, this.store.unreadCount(userId));
    }
    const online = this.opts.isOnline?.(userId) ?? false;
    const push = wantPush && !online && !inQuietHours(prefs.quietHours, now) ? this.sendPush(userId, n, input.collapseKey) : null;
    return { notification: wantInApp || wantPush ? n : null, inApp: wantInApp, push };
  }

  private sendPush(userId: string, n: AppNotification, collapseKey?: string): Promise<boolean> | null {
    const tokens = this.store.pushTokens(userId);
    if (tokens.length === 0) return null;
    const badge = this.store.unreadCount(userId);
    const results = tokens.map(
      (t) =>
        new Promise<boolean>((done) =>
          this.enqueue(
            {
              to: t.token,
              title: n.title,
              body: n.body,
              data: { id: n.id, kind: n.kind, url: n.url, ...n.data },
              sound: 'default',
              badge,
              channelId: 'default',
              threadId: collapseKey,
              priority: 'high',
              platform: t.platform,
            },
            done,
          ),
        ),
    );
    return Promise.all(results).then((oks) => oks.some(Boolean));
  }

  private enqueue(msg: PushMessage, done: (ok: boolean) => void) {
    this.queue.push({ msg, done });
    if (this.queue.length >= BATCH) this.drain();
    else this.timer ??= setTimeout(() => this.drain(), this.opts.batchMs ?? 25);
  }

  private drain() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.queue.length) {
      const batch = this.queue.splice(0, BATCH);
      const p = this.push
        .send(batch.map((b) => b.msg))
        .then((r) => {
          for (const token of r.invalidTokens) this.store.removePushToken(token);
          batch.forEach((b, i) => b.done(r.ok[i] ?? false));
        })
        .catch((e: unknown) => {
          this.opts.log?.(`push error: ${String(e)}`);
          for (const b of batch) b.done(false);
        })
        .finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    }
  }

  /** Resolves once every queued push has been handed to Expo. */
  async flush(): Promise<void> {
    if (this.queue.length) this.drain();
    while (this.inflight.size) await Promise.all([...this.inflight]);
  }
}
