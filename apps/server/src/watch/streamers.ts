import {
  STREAMER_LIMITS,
  cleanGoLive,
  cleanStreamerApplication,
  cleanStreamerProfile,
  hasPermission,
  isChessTitle,
  platformOf,
  type MyStreamerState,
  type StaffRole,
  type StreamChannel,
  type StreamerApplicationView,
  type StreamerView,
} from '@chessmate/core';
import {
  countStreamerApplicationsSince,
  deleteStreamer,
  endStaleStreams,
  getStreamer,
  getStreamerApplication,
  insertAudit,
  insertStreamerApplication,
  latestStreamerApplication,
  listStreamerApplications,
  listStreamers,
  reviewStreamerApplication,
  setStreamerLive,
  upsertStreamer,
  type Database,
  type StreamerApplicationWithUser,
  type StreamerWithUser,
} from '@chessmate/db';

import { WatchError, fail } from './errors';

export interface StreamerServiceOptions {
  db: Database;
  now?: () => number;
  roleOf: (userId: string) => StaffRole;
  usernameOf?: (userId: string) => string | undefined;
}

export interface StreamerHooks {
  notify(userId: string, title: string, body: string, url: string | null): void;
  /** Gives or takes the streamer badge (only when the player has no other tag). */
  setStreamerTag(userId: string, on: boolean): Promise<void>;
}

const LIST_TTL_MS = 10_000;

const toView = (s: StreamerWithUser): StreamerView => ({
  userId: s.userId,
  username: s.username,
  displayName: s.displayName || s.username,
  title: s.title && isChessTitle(s.title) ? s.title : null,
  country: s.country,
  headline: s.headline,
  channels: s.channels as StreamChannel[],
  live: s.liveSince && s.liveUrl ? { since: s.liveSince.getTime(), title: s.liveTitle ?? '', url: s.liveUrl, platform: platformOf(s.liveUrl) } : null,
});

const appView = (a: StreamerApplicationWithUser): StreamerApplicationView => ({
  id: a.id,
  userId: a.userId,
  username: a.username,
  displayName: a.displayName || a.username,
  channels: a.channels as StreamChannel[],
  about: a.about,
  status: a.status as StreamerApplicationView['status'],
  note: a.note,
  createdAt: a.createdAt.getTime(),
  reviewedAt: a.reviewedAt?.getTime() ?? null,
});

/**
 * Streamers: applications, approved profiles and live status. Staff with
 * `streamers.review` approve or remove streamers.
 */
export class StreamerService {
  private hooks: StreamerHooks = { notify: () => {}, setStreamerTag: async () => {} };
  private cache: { at: number; list: StreamerView[] } | null = null;

  constructor(private readonly opts: StreamerServiceOptions) {}

  attach(hooks: StreamerHooks) {
    this.hooks = hooks;
  }

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  private get db() {
    return this.opts.db;
  }

  private requireReviewer(userId: string) {
    if (!hasPermission(this.opts.roleOf(userId), 'streamers.review')) throw new WatchError(403, 'Only ChessMate staff can do that');
  }

  private invalidate() {
    this.cache = null;
  }

  /** Approved streamers, live ones first (newest stream first). */
  async list(): Promise<StreamerView[]> {
    if (this.cache && this.now() - this.cache.at < LIST_TTL_MS) return this.cache.list;
    const list = (await listStreamers(this.db)).map(toView).sort((a, b) => (b.live?.since ?? 0) - (a.live?.since ?? 0) || a.username.localeCompare(b.username));
    this.cache = { at: this.now(), list };
    return list;
  }

  async get(userId: string): Promise<StreamerView | null> {
    const s = await getStreamer(this.db, userId);
    return s ? toView(s) : null;
  }

  async mine(userId: string): Promise<MyStreamerState> {
    const [streamer, application] = await Promise.all([this.get(userId), latestStreamerApplication(this.db, userId)]);
    return { streamer, application: application ? appView(application) : null, canApply: !streamer && application?.status !== 'pending' };
  }

  async apply(userId: string, raw: unknown): Promise<StreamerApplicationView> {
    const input = cleanStreamerApplication(raw);
    if ('error' in input) fail(input);
    const v = (input as { value: { channels: StreamChannel[]; about: string } }).value;
    if (await getStreamer(this.db, userId)) throw new WatchError(409, 'You are already a streamer');
    const last = await latestStreamerApplication(this.db, userId);
    if (last?.status === 'pending') throw new WatchError(409, 'Your application is being reviewed');
    if ((await countStreamerApplicationsSince(this.db, userId, new Date(this.now() - 30 * 86_400_000))) >= STREAMER_LIMITS.applicationsPer30d) {
      throw new WatchError(429, 'You have applied too often. Try again later.');
    }
    await insertStreamerApplication(this.db, { userId, channels: v.channels, about: v.about });
    return appView((await latestStreamerApplication(this.db, userId))!);
  }

  async updateProfile(userId: string, raw: unknown): Promise<StreamerView> {
    if (!(await getStreamer(this.db, userId))) throw new WatchError(403, 'Only approved streamers can do that');
    const input = cleanStreamerProfile(raw);
    if ('error' in input) fail(input);
    await upsertStreamer(this.db, userId, (input as { value: { headline: string; channels: StreamChannel[] } }).value);
    this.invalidate();
    return (await this.get(userId))!;
  }

  async goLive(userId: string, raw: unknown): Promise<StreamerView> {
    const s = await getStreamer(this.db, userId);
    if (!s) throw new WatchError(403, 'Only approved streamers can go live');
    const input = cleanGoLive(raw, s.channels as StreamChannel[]);
    if ('error' in input) fail(input);
    const v = (input as { value: { title: string; url: string } }).value;
    await setStreamerLive(this.db, userId, { ...v, since: new Date(this.now()) });
    this.invalidate();
    return (await this.get(userId))!;
  }

  async endLive(userId: string): Promise<StreamerView | null> {
    await setStreamerLive(this.db, userId, null);
    this.invalidate();
    return this.get(userId);
  }

  /** Switches off streams left on for longer than the limit. */
  async sweep(): Promise<void> {
    const n = await endStaleStreams(this.db, new Date(this.now() - STREAMER_LIMITS.liveHours * 3_600_000));
    if (n) this.invalidate();
  }

  async applications(staffId: string, status?: string): Promise<StreamerApplicationView[]> {
    this.requireReviewer(staffId);
    return (await listStreamerApplications(this.db, status && ['pending', 'approved', 'rejected'].includes(status) ? status : undefined)).map(appView);
  }

  async review(staffId: string, id: string, input: { approve?: unknown; note?: unknown }): Promise<StreamerApplicationView> {
    this.requireReviewer(staffId);
    const a = await getStreamerApplication(this.db, id);
    if (!a) throw new WatchError(404, 'Application not found');
    if (a.status !== 'pending') throw new WatchError(409, 'This application was already reviewed');
    const approve = input.approve === true;
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) || null : null;
    await reviewStreamerApplication(this.db, id, { status: approve ? 'approved' : 'rejected', note, reviewedBy: staffId });
    if (approve) {
      await upsertStreamer(this.db, a.userId, { headline: '', channels: a.channels as StreamChannel[] });
      await this.hooks.setStreamerTag(a.userId, true);
      this.invalidate();
      this.hooks.notify(a.userId, 'You are a ChessMate streamer', 'Your streamer badge is on. Go live from Settings → Streamer.', '/settings/streamer');
    } else {
      this.hooks.notify(a.userId, 'Streamer application', note ? `Not approved: ${note}` : 'Your streamer application was not approved this time.', '/settings/streamer');
    }
    await insertAudit(this.db, {
      actorId: staffId,
      actorName: this.opts.usernameOf?.(staffId) ?? staffId,
      action: approve ? 'streamer.approve' : 'streamer.reject',
      targetType: 'user',
      targetId: a.userId,
      targetName: a.username,
      reason: note,
      details: { applicationId: id },
      at: new Date(this.now()),
    });
    return appView((await getStreamerApplication(this.db, id))!);
  }

  /** Removes a streamer (and their badge). */
  async remove(staffId: string, userId: string, note?: unknown): Promise<void> {
    this.requireReviewer(staffId);
    const s = await getStreamer(this.db, userId);
    if (!s || !(await deleteStreamer(this.db, userId))) throw new WatchError(404, 'Not a streamer');
    await this.hooks.setStreamerTag(userId, false);
    this.invalidate();
    const reason = typeof note === 'string' ? note.trim().slice(0, 500) || null : null;
    await insertAudit(this.db, {
      actorId: staffId,
      actorName: this.opts.usernameOf?.(staffId) ?? staffId,
      action: 'streamer.remove',
      targetType: 'user',
      targetId: userId,
      targetName: s.username,
      reason,
      details: {},
      at: new Date(this.now()),
    });
  }
}
