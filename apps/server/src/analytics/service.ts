import { ANALYTICS_RANGES, ANALYTICS_RETENTION_DAYS, parseAnalyticsBatch, type AnalyticsRange, type AnalyticsReport } from '@chessmate/core';
import { analyticsReport, deleteAnalyticsDevice, insertAnalyticsEvents, pruneAnalyticsEvents, type Database } from '@chessmate/db';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Events one address may send per minute; more are dropped quietly (a stuck client, or someone filling the table). */
const EVENTS_PER_MINUTE = 240;
/** The report runs about twenty grouped queries; staff refreshing the page share one result for this long. */
const REPORT_CACHE_MS = 60_000;

export interface AnalyticsServiceOptions {
  db: Database;
  now?: () => number;
  log?: (msg: string) => void;
}

/**
 * First-party analytics for the admin console. The app posts batches of
 * events (only after the visitor allowed analytics); this keeps them in
 * analytics_events for ANALYTICS_RETENTION_DAYS and builds the report.
 * Google Analytics gets its copy straight from the app, not from here.
 */
export class AnalyticsService {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private readonly budget = new Map<string, { windowStart: number; used: number }>();
  private readonly cache = new Map<AnalyticsRange, { at: number; report: Omit<AnalyticsReport, 'live'> }>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: AnalyticsServiceOptions) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[analytics] ${m}`));
  }

  /** Deletes expired events now and once a day after. */
  start() {
    void this.prune();
    this.pruneTimer = setInterval(() => void this.prune(), DAY);
    this.pruneTimer.unref?.();
  }

  stop() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
  }

  async prune(): Promise<number> {
    try {
      const n = await pruneAnalyticsEvents(this.db, new Date(this.now() - ANALYTICS_RETENTION_DAYS * DAY));
      if (n) this.log(`deleted ${n} event(s) older than ${ANALYTICS_RETENTION_DAYS} days`);
      return n;
    } catch (e) {
      this.log(`prune failed: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }

  private allow(key: string, n: number): number {
    const now = this.now();
    let b = this.budget.get(key);
    if (!b || now - b.windowStart >= MINUTE) {
      b = { windowStart: now, used: 0 };
      this.budget.set(key, b);
      if (this.budget.size > 50_000) for (const [k, v] of this.budget) if (now - v.windowStart >= MINUTE) this.budget.delete(k);
    }
    const take = Math.max(0, Math.min(n, EVENTS_PER_MINUTE - b.used));
    b.used += take;
    return take;
  }

  /** Stores a batch from the app. Returns how many events were kept. Never throws on bad input. */
  async ingest(raw: unknown, userId: string | null, ip: string): Promise<number> {
    const batch = parseAnalyticsBatch(raw, this.now());
    if (!batch || batch.events.length === 0) return 0;
    const take = this.allow(ip, batch.events.length);
    if (!take) return 0;
    const rows = batch.events.slice(0, take).map((e) => ({
      name: e.name,
      at: new Date(e.at),
      deviceId: batch.deviceId,
      sessionId: batch.sessionId,
      userId,
      platform: batch.platform,
      screen: e.screen ?? null,
      props: e.props ?? null,
      appVersion: batch.appVersion ?? null,
      lang: batch.lang ?? null,
    }));
    await insertAnalyticsEvents(this.db, rows);
    return rows.length;
  }

  /** A visitor withdrew consent: drop what this device sent. */
  async forget(deviceId: unknown): Promise<number> {
    if (typeof deviceId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) return 0;
    return deleteAnalyticsDevice(this.db, deviceId);
  }

  async report(days: number): Promise<Omit<AnalyticsReport, 'live'>> {
    const range: AnalyticsRange = (ANALYTICS_RANGES as readonly number[]).includes(days) ? (days as AnalyticsRange) : 30;
    const hit = this.cache.get(range);
    const now = this.now();
    if (hit && now - hit.at < REPORT_CACHE_MS) return hit.report;
    const facts = await analyticsReport(this.db, { now: new Date(now), days: range });
    const report = { days: range, generatedAt: now, ...facts };
    this.cache.set(range, { at: now, report });
    return report;
  }
}
