import {
  CAMPAIGN_DAILY_CAP,
  CampaignInputError,
  EMPTY_AUDIENCE,
  EMPTY_STATS,
  cleanAudience,
  cleanCampaignInput,
  cleanTrigger,
  personalize,
  type Campaign,
  type CampaignKind,
  type CampaignMessage,
  type CampaignStats,
  type CampaignStatus,
  type CampaignTrigger,
  type PushHealth,
  type TriggerEvent,
} from '@chessmate/core';
import {
  campaignDeliveryHistory,
  countAudience,
  countGamesSince,
  deletePushCampaign,
  deleteTriggerJobs,
  filterAudience,
  inactiveTriggerCandidates,
  insertPushCampaign,
  listPushCampaigns,
  newPlayerTriggerCandidates,
  pushTokenStats,
  recentDeliveryCounts,
  recordCampaignDeliveries,
  resolveAudience,
  takeDueTriggerJobs,
  touchLastSeen,
  updatePushCampaign,
  upsertTriggerJob,
  type Database,
  type PushCampaignRow,
} from '@chessmate/db';

import type { PlayerActivityHooks } from '../server';
import type { NotificationService } from './service';
import type { NotifyInput } from './templates';

export class CampaignError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface CampaignServiceOptions {
  db: Database;
  notifications: NotificationService;
  /** True while the player has the app in front on some device (set once the game server exists). */
  isForeground?: (userId: string) => boolean;
  now?: () => number;
  log?: (msg: string) => void;
  /** How often scheduled campaigns, trigger sends and receipts are checked. */
  tickMs?: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** last_seen_at is written at most this often per player. */
const SEEN_EVERY_MS = 5 * MINUTE;
/** Inactivity and "new player" scans run this often. */
const SCAN_EVERY_MS = 10 * MINUTE;
const RECEIPTS_EVERY_MS = 5 * MINUTE;
const PAGE = 500;

function fromRow(r: PushCampaignRow): Campaign {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as CampaignKind,
    status: r.status as CampaignStatus,
    message: r.message as unknown as CampaignMessage,
    audience: { ...EMPTY_AUDIENCE, ...cleanAudience(r.audience) },
    scheduleAt: r.scheduleAt?.getTime() ?? null,
    trigger: r.trigger ? cleanTrigger(r.trigger) : null,
    stats: { ...EMPTY_STATS, ...(r.stats as Partial<CampaignStats>) },
    createdBy: r.createdBy,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    sentAt: r.sentAt?.getTime() ?? null,
    lastError: r.lastError,
  };
}

const isFkViolation = (e: unknown): boolean => {
  for (let cur: unknown = e; cur && typeof cur === 'object'; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === '23503') return true;
  }
  return false;
};

/**
 * Push campaigns from the admin console.
 *
 *   instant    goes out when staff press Send
 *   scheduled  goes out at `scheduleAt` (checked every tick, so within ~30 s; survives restarts)
 *   trigger    sends to each player when something happens (see TRIGGER_EVENTS in @chessmate/core)
 *
 * Everything goes through NotificationService, so players' own settings
 * ("News and reminders" off), quiet hours and the "app is open, show it
 * in-app instead" rule apply. Triggers are also held to CAMPAIGN_DAILY_CAP
 * campaign notifications per player per day, a per-trigger cooldown and an
 * optional lifetime limit, so automation cannot spam anyone.
 */
export class CampaignService implements PlayerActivityHooks {
  private campaigns = new Map<string, Campaign>();
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking: Promise<void> | null = null;
  private lastScan = 0;
  private lastReceipts = 0;
  private seen = new Map<string, number>();
  /** Open app sessions: when the player came to the front, and whether they started a game since. */
  private sessions = new Map<string, { start: number; played: boolean }>();
  /** Stats changed in memory since the last database write. */
  private dirty = new Set<string>();
  private sending = new Set<string>();
  isForeground: (userId: string) => boolean;

  constructor(private readonly opts: CampaignServiceOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[campaigns] ${m}`));
    this.isForeground = opts.isForeground ?? (() => false);
  }

  private get db() {
    return this.opts.db;
  }

  async load(): Promise<void> {
    for (const r of await listPushCampaigns(this.db)) {
      const c = fromRow(r);
      // A send cut off by a restart picks up where it left off (players already reached are skipped).
      this.campaigns.set(c.id, c);
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.opts.tickMs ?? 30_000);
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.ticking;
    await this.saveStats();
  }

  // ------------------------------------------------------------ console

  list(): Campaign[] {
    return [...this.campaigns.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): Campaign {
    const c = this.campaigns.get(id);
    if (!c) throw new CampaignError(404, 'No such campaign');
    return c;
  }

  private clean(input: unknown) {
    try {
      return cleanCampaignInput(input, this.now());
    } catch (e) {
      if (e instanceof CampaignInputError) throw new CampaignError(400, e.message);
      throw e;
    }
  }

  /**
   * Creates a campaign. `go` sends an instant one now, schedules a scheduled
   * one, or switches a trigger on; without it the campaign is a draft.
   */
  async create(input: unknown, createdBy: string, go: boolean): Promise<Campaign> {
    const i = this.clean(input);
    const row = await insertPushCampaign(this.db, {
      name: i.name,
      kind: i.kind,
      status: 'draft',
      message: i.message as unknown as Record<string, unknown>,
      audience: i.audience as unknown as Record<string, unknown>,
      trigger: i.trigger as unknown as Record<string, unknown> | null,
      scheduleAt: i.scheduleAt === null ? null : new Date(i.scheduleAt),
      stats: { ...EMPTY_STATS },
      createdBy,
    });
    const c = fromRow(row);
    this.campaigns.set(c.id, c);
    return go ? this.launch(c.id) : c;
  }

  /** Saves changes; only before it went out (draft, scheduled) or for a trigger. */
  async update(id: string, input: unknown): Promise<Campaign> {
    const c = this.get(id);
    if (!['draft', 'scheduled', 'active', 'paused'].includes(c.status)) throw new CampaignError(409, 'This campaign was already sent');
    const i = this.clean(input);
    if ((c.kind === 'trigger') !== (i.kind === 'trigger')) throw new CampaignError(409, 'A trigger cannot become a one-off send. Make a new campaign');
    const status: CampaignStatus = c.status === 'scheduled' && i.kind !== 'scheduled' ? 'draft' : c.status;
    return this.save(id, {
      name: i.name,
      kind: i.kind,
      status,
      message: i.message as unknown as Record<string, unknown>,
      audience: i.audience as unknown as Record<string, unknown>,
      trigger: i.trigger as unknown as Record<string, unknown> | null,
      scheduleAt: i.scheduleAt === null ? null : new Date(i.scheduleAt),
    });
  }

  /** Send now / schedule / switch on, depending on the kind. */
  async launch(id: string): Promise<Campaign> {
    const c = this.get(id);
    if (c.kind === 'trigger') {
      if (c.status !== 'draft' && c.status !== 'paused') throw new CampaignError(409, 'This trigger is already on');
      return this.save(id, { status: 'active', lastError: null });
    }
    if (c.status !== 'draft' && c.status !== 'scheduled') throw new CampaignError(409, 'This campaign was already sent');
    if (c.kind === 'scheduled') {
      if (!c.scheduleAt) throw new CampaignError(400, 'Pick when to send it');
      if (c.scheduleAt > this.now()) return this.save(id, { status: 'scheduled' });
    }
    const sending = await this.save(id, { status: 'sending', lastError: null });
    void this.runSend(id);
    return sending;
  }

  async pause(id: string): Promise<Campaign> {
    const c = this.get(id);
    if (c.status !== 'active') throw new CampaignError(409, 'Only a trigger that is on can be paused');
    return this.save(id, { status: 'paused' });
  }

  /** Stops a scheduled campaign or a trigger. */
  async cancel(id: string): Promise<Campaign> {
    const c = this.get(id);
    if (!['draft', 'scheduled', 'active', 'paused'].includes(c.status)) throw new CampaignError(409, 'Nothing to cancel');
    return this.save(id, { status: 'cancelled' });
  }

  async remove(id: string): Promise<void> {
    const c = this.get(id);
    if (c.status === 'sending') throw new CampaignError(409, 'Wait until it has finished sending');
    await deletePushCampaign(this.db, id);
    this.campaigns.delete(id);
  }

  /** How many players an audience reaches now, and a few of their names. */
  async preview(audience: unknown): Promise<{ count: number; sample: string[]; withPush: number }> {
    const a = cleanAudience(audience);
    const now = this.now();
    const [count, sample] = await Promise.all([countAudience(this.db, a, now), resolveAudience(this.db, a, now, { limit: 8 })]);
    const withPush =
      a.platform === 'web'
        ? 0
        : a.platform === 'any'
          ? await Promise.all([countAudience(this.db, { ...a, platform: 'ios' }, now), countAudience(this.db, { ...a, platform: 'android' }, now)]).then(([i, d]) => Math.min(count, i + d))
          : count;
    return { count, sample: sample.map((s) => s.username), withPush };
  }

  /** Sends the message to one staff member's own devices, ignoring their settings, to check how it looks. */
  async test(message: unknown, user: { id: string; username: string }) {
    const i = this.clean({ kind: 'instant', message, audience: EMPTY_AUDIENCE });
    const tokens = this.opts.notifications.store.pushTokens(user.id).length;
    const r = await this.opts.notifications.deliver(user.id, this.notification(null, i.message, user.username), { inApp: true, push: true });
    await this.opts.notifications.flush();
    return { devices: tokens, push: r.push };
  }

  async health(): Promise<PushHealth> {
    const sender = this.opts.notifications.pushSender;
    const h = sender.health?.() ?? { sending: false, accessToken: false, errors: [], totals: { accepted: 0, delivered: 0, failed: 0 } };
    const stats = await pushTokenStats(this.db);
    return { ...stats, ...h };
  }

  private async save(id: string, patch: Parameters<typeof updatePushCampaign>[2]): Promise<Campaign> {
    const c = this.get(id);
    const row = await updatePushCampaign(this.db, id, { ...patch, stats: { ...c.stats } });
    if (!row) throw new CampaignError(404, 'No such campaign');
    const next = fromRow(row);
    this.campaigns.set(id, next);
    this.dirty.delete(id);
    return next;
  }

  // ------------------------------------------------------------ sending

  private notification(c: Campaign | null, m: CampaignMessage, username: string): NotifyInput {
    return {
      kind: 'news',
      title: personalize(m.title, { username }),
      body: personalize(m.body, { username }),
      url: m.url,
      data: c ? { campaignId: c.id } : { test: '1' },
      collapseKey: c ? `campaign:${c.id}` : undefined,
    };
  }

  /** Delivers to one player and counts the outcome. Returns true when it reached them (inbox or push). */
  private async sendOne(c: Campaign, userId: string, username: string): Promise<boolean> {
    const r = await this.opts.notifications.deliver(userId, this.notification(c, c.message, username), { inApp: c.message.inbox, push: c.message.push });
    // The map holds the newest copy (a pause or cancel during a send replaces it).
    const s = (this.campaigns.get(c.id) ?? c).stats;
    s.targeted++;
    if (r.inApp) s.inbox++;
    if (r.push === 'sent') s.pushed++;
    else if (r.push === 'failed') s.failed++;
    const reached = r.inApp || r.push === 'sent';
    if (!reached) s.skipped++;
    this.dirty.add(c.id);
    return reached;
  }

  /** Instant and scheduled sends: every player in the audience, in pages, skipping anyone it already reached. */
  private async runSend(id: string) {
    if (this.sending.has(id)) return;
    this.sending.add(id);
    try {
      const c = this.get(id);
      const now = this.now();
      let afterId: string | undefined;
      for (;;) {
        const page = await resolveAudience(this.db, c.audience, now, { limit: PAGE, afterId });
        if (!page.length) break;
        afterId = page.at(-1)!.id;
        const done = await campaignDeliveryHistory(this.db, id, page.map((p) => p.id));
        const reached: string[] = [];
        await Promise.all(
          page
            .filter((p) => !done.has(p.id))
            .map(async (p) => {
              if (await this.sendOne(c, p.id, p.username)) reached.push(p.id);
            }),
        );
        await recordCampaignDeliveries(this.db, id, reached, new Date(this.now()));
        await this.opts.notifications.flush();
        if (this.get(id).status === 'cancelled') break;
        if (page.length < PAGE) break;
      }
      if (this.get(id).status === 'sending') await this.save(id, { status: 'sent', sentAt: new Date(this.now()) });
      else await this.saveStats();
      this.log(`campaign "${c.name}" sent: ${JSON.stringify(c.stats)}`);
    } catch (e) {
      this.log(`campaign ${id} failed: ${String(e)}`);
      if (this.campaigns.has(id)) await this.save(id, { status: 'failed', lastError: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    } finally {
      this.sending.delete(id);
    }
  }

  /** Checks a trigger's limits for these players and sends to those who pass. */
  private async fireTrigger(c: Campaign, userIds: string[]) {
    if (c.status !== 'active' || !c.trigger || !userIds.length) return;
    const t = c.trigger;
    const now = this.now();
    const members = await filterAudience(this.db, c.audience, userIds, now);
    const ids = [...members.keys()];
    const [history, today] = await Promise.all([campaignDeliveryHistory(this.db, c.id, ids), recentDeliveryCounts(this.db, ids, new Date(now - DAY))]);
    const reached: string[] = [];
    for (const id of ids) {
      const h = history.get(id);
      if (h && t.maxPerUser > 0 && h.count >= t.maxPerUser) continue;
      if (h && now - h.last < t.cooldownHours * HOUR) continue;
      if ((today.get(id) ?? 0) >= CAMPAIGN_DAILY_CAP) continue;
      if (await this.sendOne(c, id, members.get(id)!)) reached.push(id);
    }
    await recordCampaignDeliveries(this.db, c.id, reached, new Date(now));
  }

  private triggers(event: TriggerEvent): (Campaign & { trigger: CampaignTrigger })[] {
    return this.list().filter((c): c is Campaign & { trigger: CampaignTrigger } => c.status === 'active' && c.trigger?.event === event);
  }

  // ------------------------------------------------------------ the clock

  /** Runs due work once. Called by the timer; tests call it directly. */
  tick(): Promise<void> {
    this.ticking ??= this.runTick().finally(() => (this.ticking = null));
    return this.ticking;
  }

  private async runTick() {
    const now = this.now();
    try {
      for (const c of this.list()) {
        if (c.status === 'scheduled' && c.scheduleAt !== null && c.scheduleAt <= now) {
          await this.save(c.id, { status: 'sending' });
          void this.runSend(c.id);
        } else if (c.status === 'sending' && !this.sending.has(c.id)) {
          void this.runSend(c.id); // cut off by a restart
        }
      }
      await this.runDueJobs();
      if (now - this.lastScan >= SCAN_EVERY_MS) {
        this.lastScan = now;
        await this.scan();
      }
      await this.saveStats();
      if (now - this.lastReceipts >= RECEIPTS_EVERY_MS) {
        this.lastReceipts = now;
        await this.opts.notifications.pushSender.checkReceipts?.();
      }
    } catch (e) {
      this.log(`tick failed: ${String(e)}`);
    }
  }

  private async runDueJobs() {
    const jobs = await takeDueTriggerJobs(this.db, new Date(this.now()));
    const byCampaign = new Map<string, { userId: string; createdAt: Date }[]>();
    for (const j of jobs) byCampaign.set(j.campaignId, [...(byCampaign.get(j.campaignId) ?? []), { userId: j.userId, createdAt: j.createdAt }]);
    for (const [cid, list] of byCampaign) {
      const c = this.campaigns.get(cid);
      if (!c || c.status !== 'active' || !c.trigger) continue;
      const ready: string[] = [];
      for (const j of list) {
        if (c.trigger.event === 'left_without_playing') {
          // Back in the app, or played since leaving: nothing to remind them of.
          if (this.isForeground(j.userId)) continue;
          if ((await countGamesSince(this.db, j.userId, j.createdAt)) > 0) continue;
        }
        ready.push(j.userId);
      }
      await this.fireTrigger(c, ready);
    }
  }

  /** Triggers found by looking at the database: away for N days, signed up without playing. */
  private async scan() {
    const now = this.now();
    for (const c of this.triggers('inactive')) {
      await this.fireTrigger(c, await inactiveTriggerCandidates(this.db, c.id, c.trigger.days, now));
    }
    for (const c of this.triggers('new_user_no_game')) {
      // Signed up between `delay` and `delay + 2 days` ago; older accounts are not "new" any more.
      const to = now - c.trigger.delayMinutes * MINUTE;
      await this.fireTrigger(c, await newPlayerTriggerCandidates(this.db, c.id, new Date(to - 2 * DAY), new Date(to)));
    }
  }

  private async saveStats() {
    for (const id of [...this.dirty]) {
      this.dirty.delete(id);
      const c = this.campaigns.get(id);
      if (c) await updatePushCampaign(this.db, id, { stats: c.stats as unknown as Record<string, number> }).catch((e) => this.log(`stats: ${String(e)}`));
    }
  }

  // ------------------------------------------------------------ player activity

  private quietly(p: Promise<unknown>) {
    void p.catch((e: unknown) => {
      // Development players ("dev:..." ids) have no account row.
      if (!isFkViolation(e)) this.log(`activity: ${String(e)}`);
    });
  }

  foreground(userId: string): void {
    const now = this.now();
    if (!this.sessions.has(userId)) this.sessions.set(userId, { start: now, played: false });
    if (now - (this.seen.get(userId) ?? 0) >= SEEN_EVERY_MS) {
      this.seen.set(userId, now);
      this.quietly(touchLastSeen(this.db, userId, new Date(now)));
    }
    const pending = this.triggers('left_without_playing').map((c) => c.id);
    if (pending.length) this.quietly(deleteTriggerJobs(this.db, userId, pending));
  }

  background(userId: string): void {
    const now = this.now();
    const s = this.sessions.get(userId);
    this.sessions.delete(userId);
    this.seen.set(userId, now);
    this.quietly(touchLastSeen(this.db, userId, new Date(now)));
    if (!s || s.played) return;
    for (const c of this.triggers('left_without_playing')) {
      this.quietly(upsertTriggerJob(this.db, c.id, userId, new Date(now + c.trigger.delayMinutes * MINUTE)));
    }
  }

  gameStarted(userId: string): void {
    const s = this.sessions.get(userId);
    if (s) s.played = true;
    const pending = this.triggers('left_without_playing').map((c) => c.id);
    if (pending.length) this.quietly(deleteTriggerJobs(this.db, userId, pending));
  }

  gameFinished(userId: string): void {
    const now = this.now();
    for (const c of this.triggers('game_finished')) {
      this.quietly(upsertTriggerJob(this.db, c.id, userId, new Date(now + c.trigger.delayMinutes * MINUTE)));
    }
  }
}

