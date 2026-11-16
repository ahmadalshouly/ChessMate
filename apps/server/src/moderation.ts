import {
  CHAT_RATE,
  REPORT_NOTE_MAX,
  isReportReason,
  prepareChat,
  quickMessageText,
  sanitizeChat,
  type ChatLine,
  type ReportReason,
} from '@chessmate/core';
import { randomUUID } from 'node:crypto';

export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export type ModAction = 'dismiss' | 'warn' | 'chat_ban' | 'unban';

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  gameId: string | null;
  reason: ReportReason;
  note: string;
  /** Chat lines of the game at report time, kept as evidence. */
  chat: ChatLine[];
  /** Moves of the game at report time (UCI), for cheating reports. */
  moves: string[];
  createdAt: number;
  status: ReportStatus;
  resolution?: { action: ModAction; note: string; by: string; at: number };
}

export interface ChatBan {
  playerId: string;
  name: string;
  until: number;
  reason: string;
  createdAt: number;
}

/** Storage boundary for moderation data. In-memory now; Postgres later. */
export interface ModerationStore {
  addReport(r: Report): void;
  getReport(id: string): Report | undefined;
  saveReport(r: Report): void;
  listReports(): Report[];
  getBan(playerId: string): ChatBan | undefined;
  saveBan(b: ChatBan): void;
  deleteBan(playerId: string): void;
  listBans(): ChatBan[];
}

export class MemoryModerationStore implements ModerationStore {
  private reports = new Map<string, Report>();
  private bans = new Map<string, ChatBan>();
  addReport(r: Report) {
    this.reports.set(r.id, r);
  }
  getReport(id: string) {
    return this.reports.get(id);
  }
  saveReport(r: Report) {
    this.reports.set(r.id, r);
  }
  listReports() {
    return [...this.reports.values()];
  }
  getBan(id: string) {
    return this.bans.get(id);
  }
  saveBan(b: ChatBan) {
    this.bans.set(b.playerId, b);
  }
  deleteBan(id: string) {
    this.bans.delete(id);
  }
  listBans() {
    return [...this.bans.values()];
  }
}

export const CHAT_LOG_LIMIT = 200;
export const REPORT_RATE = { max: 5, windowMs: 3600_000 } as const;

type ChatResult = { ok: true; line: ChatLine } | { ok: false; code: 'bad_request' | 'rate_limited' | 'chat_restricted'; message: string };
type ReportResult = { ok: true; report: Report } | { ok: false; code: 'bad_request' | 'rate_limited'; message: string };

interface Sender {
  id: string;
  name: string;
}

/**
 * Chat relay rules and the report/moderation queue. The game server calls
 * into this; it holds no sockets itself so it is easy to test.
 */
export class Moderation {
  private readonly logs = new Map<string, ChatLine[]>();
  private readonly chatTimes = new Map<string, number[]>();
  private readonly reportTimes = new Map<string, number[]>();

  constructor(
    readonly store: ModerationStore = new MemoryModerationStore(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Validates, rate-limits and filters a chat message, then appends it to the game log. */
  chat(sender: Sender, gameId: string, msg: { text?: unknown; quick?: unknown }): ChatResult {
    const now = this.now();
    const ban = this.activeBan(sender.id, now);
    if (ban) {
      const mins = Math.ceil((ban.until - now) / 60_000);
      return { ok: false, code: 'chat_restricted', message: `Chat is disabled for your account for ${mins} more minute${mins === 1 ? '' : 's'}` };
    }
    let text: string;
    let filtered = false;
    let quick: ChatLine['quick'];
    if (msg.quick !== undefined) {
      const q = typeof msg.quick === 'string' ? quickMessageText(msg.quick) : null;
      if (!q) return { ok: false, code: 'bad_request', message: 'Unknown quick message' };
      text = q;
      quick = msg.quick as ChatLine['quick'];
    } else {
      const prepared = prepareChat(msg.text);
      if (!prepared) return { ok: false, code: 'bad_request', message: 'Empty message' };
      text = prepared.text;
      filtered = prepared.filtered;
    }
    if (!this.allow(this.chatTimes, sender.id, CHAT_RATE, now)) {
      return { ok: false, code: 'rate_limited', message: 'Slow down: too many messages' };
    }
    const line: ChatLine = { id: randomUUID().slice(0, 12), gameId, playerId: sender.id, name: sender.name, text, at: now };
    if (quick) line.quick = quick;
    if (filtered) line.filtered = true;
    const log = this.logs.get(gameId) ?? [];
    log.push(line);
    if (log.length > CHAT_LOG_LIMIT) log.splice(0, log.length - CHAT_LOG_LIMIT);
    this.logs.set(gameId, log);
    return { ok: true, line };
  }

  chatLog(gameId: string): ChatLine[] {
    return [...(this.logs.get(gameId) ?? [])];
  }

  /** Drops a finished game's chat log (reports keep their own copy). */
  forgetGame(gameId: string) {
    this.logs.delete(gameId);
  }

  report(
    reporter: Sender,
    target: Sender,
    input: { gameId?: string | null; reason: unknown; note?: unknown; moves?: string[] },
  ): ReportResult {
    const now = this.now();
    if (reporter.id === target.id) return { ok: false, code: 'bad_request', message: 'You cannot report yourself' };
    if (!isReportReason(input.reason)) return { ok: false, code: 'bad_request', message: 'Choose a reason' };
    const gameId = input.gameId ?? null;
    const existing = this.store
      .listReports()
      .find((r) => r.status === 'open' && r.reporterId === reporter.id && r.targetId === target.id && r.gameId === gameId && r.reason === input.reason);
    if (existing) return { ok: true, report: existing };
    if (!this.allow(this.reportTimes, reporter.id, REPORT_RATE, now)) {
      return { ok: false, code: 'rate_limited', message: 'Too many reports. Try again later' };
    }
    const report: Report = {
      id: randomUUID(),
      reporterId: reporter.id,
      reporterName: reporter.name,
      targetId: target.id,
      targetName: target.name,
      gameId,
      reason: input.reason,
      note: typeof input.note === 'string' ? sanitizeChat(input.note).slice(0, REPORT_NOTE_MAX) : '',
      chat: gameId ? this.chatLog(gameId) : [],
      moves: input.moves ?? [],
      createdAt: now,
      status: 'open',
    };
    this.store.addReport(report);
    return { ok: true, report };
  }

  /** Applies a moderator decision to a report. */
  resolve(reportId: string, action: ModAction, opts: { note?: string; by: string; durationHours?: number }): Report | null {
    const r = this.store.getReport(reportId);
    if (!r) return null;
    const now = this.now();
    if (action === 'chat_ban') this.ban(r.targetId, r.targetName, opts.durationHours ?? 24, opts.note || r.reason);
    if (action === 'unban') this.store.deleteBan(r.targetId);
    const updated: Report = {
      ...r,
      status: action === 'dismiss' ? 'dismissed' : 'actioned',
      resolution: { action, note: opts.note ?? '', by: opts.by, at: now },
    };
    this.store.saveReport(updated);
    return updated;
  }

  ban(playerId: string, name: string, hours: number, reason: string): ChatBan {
    const now = this.now();
    const h = Math.min(Math.max(hours, 0.25), 24 * 365);
    const ban: ChatBan = { playerId, name, until: now + h * 3600_000, reason, createdAt: now };
    this.store.saveBan(ban);
    return ban;
  }

  activeBan(playerId: string, now = this.now()): ChatBan | undefined {
    const b = this.store.getBan(playerId);
    if (b && b.until <= now) {
      this.store.deleteBan(playerId);
      return undefined;
    }
    return b;
  }

  /** Reports with the same target counted, so moderators see repeat offenders. */
  reportCountFor(targetId: string): number {
    return this.store.listReports().filter((r) => r.targetId === targetId).length;
  }

  private allow(map: Map<string, number[]>, key: string, rate: { max: number; windowMs: number }, now: number): boolean {
    const times = (map.get(key) ?? []).filter((t) => now - t < rate.windowMs);
    if (times.length >= rate.max) {
      map.set(key, times);
      return false;
    }
    times.push(now);
    map.set(key, times);
    return true;
  }
}
