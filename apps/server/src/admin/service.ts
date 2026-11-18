import {
  ACCOUNT_CLOSE_REASONS,
  MAX_RATING_ADJUSTMENT,
  WARNING_CATEGORIES,
  hasPermission,
  isProvisionalRating,
  isStaff,
  timeCategory,
  ROLE_PERMISSIONS,
  type AccountCloseReason,
  type AdminAuditEntry,
  type AdminDashboard,
  type AdminFairPlayCase,
  type AdminFairPlayFile,
  type AdminGameDetail,
  type AdminGameSummary,
  type AdminMe,
  type AdminPermission,
  type AdminPlayerDetail,
  type AdminPlayerSummary,
  type AdminReport,
  type CategoryRating,
  type ChatLine,
  type FairPlayStatus,
  type RatingCategory,
  type ReportAction,
  type StaffRole,
} from '@chessmate/core';
import {
  adminCounts,
  adminSearchUsers,
  closeUserAccount,
  getGame,
  getUser,
  insertAudit,
  insertWarning,
  listAudit,
  listClosedUsers,
  listRecentGames,
  listStaff,
  listWarnings,
  reopenUserAccount,
  setUserRole,
  updateUser,
  UniqueViolation,
  findUserByUsername,
  type AdminAuditRow,
  type Database,
  type GameRow,
  type User,
} from '@chessmate/db';
import type { AuthService } from '../auth/service';
import { validateUsername, AuthError } from '../auth/service';
import type { FairPlayCase, FairPlayService } from '../fairplay';
import type { GameRoom } from '../gameRoom';
import type { Moderation, Report } from '../moderation';
import type { NotificationService } from '../notifications';
import type { RatingService } from '../ratingService';

export type AdminErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_input' | 'conflict' | 'unavailable';

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** The staff member performing an action. */
export interface Actor {
  id: string;
  username: string;
  role: StaffRole;
}

/** WebSocket close code for accounts closed by staff (fair play uses 4010). */
export const CLOSE_ACCOUNT_CLOSED = 4011;

/** What the admin service needs from the running game server. */
export interface AdminBridge {
  moderation: Moderation;
  fairPlay: FairPlayService;
  ratings: RatingService;
  notifications: NotificationService;
  analysisEnabled: boolean;
  live(): { playersOnline: number; gamesInProgress: number; playersSeeking: number };
  isOnline(userId: string): boolean;
  liveGameOf(userId: string): string | null;
  /** Closes every socket of the account and forfeits its live game. */
  disconnect(userId: string, code: number, reason: string): void;
  /** Moves a rating without counting a game, in memory and in the database. */
  adjustRating(userId: string, category: RatingCategory, delta: number, sourceId: string): { before: CategoryRating; after: CategoryRating };
  room(gameId: string): GameRoom | undefined;
  spectators(gameId: string): number;
  /** Ends a live game with no result. */
  terminate(gameId: string): boolean;
}

export interface AdminServiceOptions {
  db: Database;
  auth: AuthService;
  now?: () => number;
  log?: (msg: string) => void;
}

const RATING_CATEGORIES: RatingCategory[] = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM: Actor = { id: 'system', username: 'system', role: 'admin' };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Everything staff can do, behind role-based permissions, with every action
 * written to the audit log. Closed accounts and staff roles are cached in
 * memory so sign-in checks and permission checks cost nothing per request.
 */
export class AdminService {
  readonly db: Database;
  private readonly auth: AuthService;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private bridge: AdminBridge | null = null;
  private readonly roles = new Map<string, StaffRole>();
  private readonly closed = new Map<string, string>();

  constructor(opts: AdminServiceOptions) {
    this.db = opts.db;
    this.auth = opts.auth;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[admin] ${m}`));
    this.auth.accountGuard = (id) => {
      const reason = this.closed.get(id);
      return reason ? { reason } : null;
    };
  }

  /**
   * Loads staff roles and closed accounts, then promotes the usernames listed
   * in ADMIN_USERNAMES (comma-separated) to admin, so the owner can make their
   * own account an admin without a database tool.
   */
  async load(bootstrapAdmins: string[] = []): Promise<void> {
    for (const s of await listStaff(this.db)) this.roles.set(s.id, s.role);
    for (const c of await listClosedUsers(this.db)) this.closed.set(c.id, c.reason ?? 'other');
    for (const name of bootstrapAdmins.map((n) => n.trim()).filter(Boolean)) {
      const u = await findUserByUsername(this.db, name);
      if (!u) {
        this.log(`ADMIN_USERNAMES: no account named "${name}" yet. Sign up with that username, then restart the server`);
        continue;
      }
      if (u.role === 'admin') continue;
      await setUserRole(this.db, u.id, 'admin');
      this.roles.set(u.id, 'admin');
      await this.audit(SYSTEM, 'role.change', { type: 'user', id: u.id, name: u.username }, 'ADMIN_USERNAMES on server start', { from: u.role, to: 'admin' });
      this.log(`${u.username} is now an admin (ADMIN_USERNAMES)`);
    }
  }

  attach(bridge: AdminBridge) {
    this.bridge = bridge;
  }

  private get b(): AdminBridge {
    if (!this.bridge) throw new AdminError('unavailable', 'Admin service is not attached to a game server');
    return this.bridge;
  }

  roleOf(userId: string): StaffRole {
    return this.roles.get(userId) ?? 'user';
  }

  isClosed(userId: string): boolean {
    return this.closed.has(userId);
  }

  /** Resolves the signed-in staff member, or throws unauthorized/forbidden. */
  actorFor(identity: { userId: string; username: string } | null): Actor {
    if (!identity) throw new AdminError('unauthorized', 'Sign in again');
    const role = this.roleOf(identity.userId);
    if (!isStaff(role)) throw new AdminError('forbidden', 'This account has no staff access');
    return { id: identity.userId, username: identity.username, role };
  }

  require(actor: Actor, p: AdminPermission) {
    if (!hasPermission(actor.role, p)) throw new AdminError('forbidden', `Your role (${actor.role}) cannot do this`);
  }

  me(actor: Actor): AdminMe {
    return { id: actor.id, username: actor.username, role: actor.role, permissions: [...ROLE_PERMISSIONS[actor.role]] };
  }

  // ---------------------------------------------------------------- audit

  private async audit(
    actor: Actor,
    action: string,
    target: { type: AdminAuditEntry['targetType']; id?: string | null; name?: string | null },
    reason?: string | null,
    details: Record<string, unknown> = {},
  ): Promise<AdminAuditEntry> {
    const row = await insertAudit(this.db, {
      actorId: actor.id,
      actorName: actor.username,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      targetName: target.name ?? null,
      reason: reason || null,
      details,
      at: new Date(this.now()),
    });
    return toAudit(row);
  }

  async auditLog(actor: Actor, q: { target?: string; actor?: string; action?: string; before?: number; limit?: number }): Promise<AdminAuditEntry[]> {
    this.require(actor, 'audit.view');
    const rows = await listAudit(this.db, {
      targetId: q.target || undefined,
      actorId: q.actor || undefined,
      actionPrefix: q.action || undefined,
      before: q.before ? new Date(q.before) : undefined,
      limit: q.limit,
    });
    return rows.map(toAudit);
  }

  // ---------------------------------------------------------------- dashboard

  async dashboard(actor: Actor): Promise<AdminDashboard> {
    this.require(actor, 'dashboard.view');
    const c = await adminCounts(this.db, new Date(this.now()));
    const now = this.now();
    const reports = this.b.moderation.store.listReports();
    return {
      live: this.b.live(),
      accounts: { total: c.users, new24h: c.newUsers24h, new7d: c.newUsers7d, closed: c.closedAccounts, staff: c.staff },
      games: { last24h: c.games24h, rated24h: c.ratedGames24h, total: c.gamesTotal },
      queues: {
        openReports: reports.filter((r) => r.status === 'open').length,
        openFairPlay: this.b.fairPlay.store.listCases('open').length,
        activeMutes: this.b.moderation.store.listBans().filter((x) => x.until > now).length,
        warnings7d: c.warnings7d,
      },
      daily: c.daily,
      recent: hasPermission(actor.role, 'audit.view') ? (await listAudit(this.db, { limit: 8 })).map(toAudit) : [],
    };
  }

  // ---------------------------------------------------------------- players

  private summary(actor: Actor, u: User): AdminPlayerSummary {
    const now = this.now();
    const b = this.b;
    const mute = b.moderation.activeBan(u.id, now);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName ?? u.username,
      email: hasPermission(actor.role, 'players.pii') ? u.email : null,
      country: u.country,
      role: this.roles.get(u.id) ?? u.role,
      status: u.closedAt || this.closed.has(u.id) ? 'closed' : 'active',
      closedReason: u.closedReason ?? this.closed.get(u.id) ?? null,
      createdAt: u.createdAt.getTime(),
      lastSeenAt: u.lastSeenAt?.getTime() ?? null,
      online: b.isOnline(u.id),
      playingGameId: b.liveGameOf(u.id),
      blitz: Math.round(b.ratings.get(u.id, 'blitz', now).rating),
      chatMutedUntil: mute?.until ?? null,
      openReports: b.moderation.store.listReports().filter((r) => r.targetId === u.id && r.status === 'open').length,
      fairPlay: this.fairPlayStatus(u.id, u.closedReason),
      devAccount: !u.email && !u.passwordHash && !UUID.test(u.id),
    };
  }

  private fairPlayStatus(id: string, closedReason?: string | null): FairPlayStatus {
    if (this.b.fairPlay.isBanned(id) || (closedReason ?? this.closed.get(id)) === 'fair_play') return 'banned';
    return this.b.fairPlay.store.getCase(id)?.status ?? 'none';
  }

  private async user(id: string): Promise<User> {
    const u = await getUser(this.db, id);
    if (!u || u.deletedAt) throw new AdminError('not_found', 'No such player');
    return u;
  }

  async searchPlayers(actor: Actor, q: { q?: string; status?: string; role?: string; offset?: number; limit?: number }) {
    this.require(actor, 'players.view');
    const status = q.status === 'active' || q.status === 'closed' ? q.status : 'all';
    const role = q.role === 'staff' || q.role === 'moderator' || q.role === 'admin' || q.role === 'user' ? q.role : undefined;
    let { rows, total } = await adminSearchUsers(this.db, { query: q.q, status, role, offset: q.offset, limit: q.limit });
    // "Muted" and "flagged" are live state, not columns: filter the page in memory.
    if (q.status === 'muted') {
      const muted = new Set(this.b.moderation.store.listBans().filter((x) => x.until > this.now()).map((x) => x.playerId));
      ({ rows, total } = await adminSearchUsers(this.db, { query: q.q, role, limit: 100 }));
      rows = rows.filter((r) => muted.has(r.id));
      total = rows.length;
    }
    return { players: rows.map((u) => this.summary(actor, u)), total };
  }

  async player(actor: Actor, id: string): Promise<AdminPlayerDetail> {
    this.require(actor, 'players.view');
    const u = await this.user(id);
    const now = this.now();
    const b = this.b;
    const all = b.ratings.all(id, now);
    const reports = b.moderation.store.listReports();
    const [warnings, games, audit] = await Promise.all([listWarnings(this.db, id), listRecentGames(this.db, { userId: id, limit: 15 }), listAudit(this.db, { targetId: id, limit: 100 })]);
    const mute = b.moderation.activeBan(id, now);
    const fpCase = b.fairPlay.store.getCase(id);
    const entries = hasPermission(actor.role, 'audit.view') ? audit.map(toAudit) : [];
    return {
      ...this.summary(actor, u),
      closed: u.closedAt ? { at: u.closedAt.getTime(), reason: u.closedReason ?? 'other', note: u.closedNote, by: u.closedBy } : null,
      ratings: RATING_CATEGORIES.map((category) => {
        const r = all[category];
        return {
          category,
          rating: Math.round(r.rating),
          rd: Math.round(r.rd),
          games: r.games,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          peak: r.peak === null ? null : Math.round(r.peak),
          provisional: isProvisionalRating(r),
        };
      }),
      warnings: warnings.map((w) => ({ id: w.id, category: w.category, message: w.message, issuedByName: w.issuedByName, reportId: w.reportId, at: w.createdAt.getTime() })),
      chatMute: mute ? { until: mute.until, reason: mute.reason } : null,
      reportsAgainst: reports
        .filter((r) => r.targetId === id)
        .sort((a, c) => c.createdAt - a.createdAt)
        .slice(0, 30)
        .map((r) => this.reportView(r)),
      reportsFiled: reports.filter((r) => r.reporterId === id).length,
      fairPlayCase: fpCase ? this.caseView(fpCase, u.username) : null,
      recentGames: games.map((g) => this.gameSummary(g)),
      audit: entries.filter((e) => e.action !== 'note'),
      notes: entries.filter((e) => e.action === 'note'),
    };
  }

  /** Formal warning: kept on the player's record and sent to them as an account notification. */
  async warn(actor: Actor, id: string, input: { category?: unknown; message?: unknown; reportId?: unknown }) {
    this.require(actor, 'players.warn');
    const u = await this.user(id);
    const category = WARNING_CATEGORIES.includes(input.category as never) ? String(input.category) : 'other';
    const message = text(input.message, 500);
    if (!message) throw new AdminError('invalid_input', 'Write the warning the player will read');
    const reportId = typeof input.reportId === 'string' ? input.reportId : null;
    const w = await insertWarning(this.db, { userId: id, category, message, issuedBy: actor.id, issuedByName: actor.username, reportId });
    this.b.notifications.notify(id, { kind: 'system', title: 'Warning from ChessMate moderators', body: message, url: null, data: { warningId: w.id, category } });
    await this.audit(actor, 'player.warn', { type: 'user', id, name: u.username }, message, { category, reportId });
    return { ok: true };
  }

  async mute(actor: Actor, id: string, input: { hours?: unknown; reason?: unknown }) {
    this.require(actor, 'players.mute');
    const u = await this.user(id);
    const hours = Number(input.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) throw new AdminError('invalid_input', 'Choose how long to mute');
    const reason = text(input.reason, 300) || 'Chat rules';
    const ban = this.b.moderation.ban(id, u.username, hours, reason);
    await this.audit(actor, 'chat.mute', { type: 'user', id, name: u.username }, reason, { hours, until: ban.until });
    return { until: ban.until };
  }

  async unmute(actor: Actor, id: string, input: { reason?: unknown }) {
    this.require(actor, 'players.mute');
    const u = await this.user(id);
    if (!this.b.moderation.activeBan(id)) throw new AdminError('conflict', 'This player is not muted');
    this.b.moderation.store.deleteBan(id);
    await this.audit(actor, 'chat.unmute', { type: 'user', id, name: u.username }, text(input.reason, 300));
    return { ok: true };
  }

  async note(actor: Actor, id: string, input: { note?: unknown }) {
    this.require(actor, 'players.note');
    const u = await this.user(id);
    const note = text(input.note, 2000);
    if (!note) throw new AdminError('invalid_input', 'Write a note');
    return this.audit(actor, 'note', { type: 'user', id, name: u.username }, note);
  }

  async rename(actor: Actor, id: string, input: { username?: unknown; reason?: unknown }) {
    this.require(actor, 'players.rename');
    const u = await this.user(id);
    let username: string;
    try {
      username = validateUsername(input.username);
    } catch (e) {
      throw new AdminError('invalid_input', e instanceof AuthError ? e.message : 'Invalid username');
    }
    const reason = text(input.reason, 300);
    if (!reason) throw new AdminError('invalid_input', 'Give a reason');
    try {
      await updateUser(this.db, id, { username, ...(u.displayName === u.username || !u.displayName ? { displayName: username } : {}) });
    } catch (e) {
      if (e instanceof UniqueViolation) throw new AdminError('conflict', 'That username is taken');
      throw e;
    }
    await this.audit(actor, 'player.rename', { type: 'user', id, name: username }, reason, { from: u.username, to: username });
    return { username };
  }

  /** Signs the player out on every device (refresh tokens revoked, sockets closed). */
  async signOutEverywhere(actor: Actor, id: string, input: { reason?: unknown }) {
    this.require(actor, 'players.signout');
    const u = await this.user(id);
    await this.auth.store.revokeUserSessions(id, this.now());
    this.b.disconnect(id, 4003, 'signed out by staff');
    await this.audit(actor, 'player.signout', { type: 'user', id, name: u.username }, text(input.reason, 300));
    return { ok: true };
  }

  async setRole(actor: Actor, id: string, input: { role?: unknown; reason?: unknown }) {
    this.require(actor, 'roles.manage');
    const role = input.role;
    if (role !== 'user' && role !== 'moderator' && role !== 'admin') throw new AdminError('invalid_input', 'Unknown role');
    if (id === actor.id) throw new AdminError('forbidden', 'You cannot change your own role');
    const u = await this.user(id);
    if (this.closed.has(id) && role !== 'user') throw new AdminError('conflict', 'Reopen the account before giving it a staff role');
    const from = this.roleOf(id);
    if (from === role) return { role };
    await setUserRole(this.db, id, role);
    if (role === 'user') this.roles.delete(id);
    else this.roles.set(id, role);
    await this.audit(actor, 'role.change', { type: 'user', id, name: u.username }, text(input.reason, 300), { from, to: role });
    return { role };
  }

  async adjustRating(actor: Actor, id: string, input: { category?: unknown; delta?: unknown; reason?: unknown }) {
    this.require(actor, 'ratings.adjust');
    const u = await this.user(id);
    const category = input.category as RatingCategory;
    if (!RATING_CATEGORIES.includes(category)) throw new AdminError('invalid_input', 'Choose a rating pool');
    const delta = Math.round(Number(input.delta));
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_RATING_ADJUSTMENT) {
      throw new AdminError('invalid_input', `Change must be between -${MAX_RATING_ADJUSTMENT} and +${MAX_RATING_ADJUSTMENT}, and not 0`);
    }
    const reason = text(input.reason, 300);
    if (!reason) throw new AdminError('invalid_input', 'Give a reason');
    const { before, after } = this.b.adjustRating(id, category, delta, `admin:${this.now()}`);
    await this.audit(actor, 'rating.adjust', { type: 'user', id, name: u.username }, reason, {
      category,
      delta,
      before: Math.round(before.rating),
      after: Math.round(after.rating),
    });
    return { category, before: Math.round(before.rating), after: Math.round(after.rating) };
  }

  /**
   * Closes an account: no sign-in, no play, every session revoked. Fair-play
   * closures also go through the fair-play service so opponents get their
   * rating back. Admins must be demoted before they can be closed.
   */
  async closeAccount(actor: Actor, id: string, input: { reason?: unknown; note?: unknown }) {
    this.require(actor, 'accounts.close');
    const reason = input.reason as AccountCloseReason;
    if (!ACCOUNT_CLOSE_REASONS.includes(reason)) throw new AdminError('invalid_input', 'Choose why the account is closed');
    if (reason === 'fair_play') this.require(actor, 'fairplay.ban');
    if (id === actor.id) throw new AdminError('forbidden', 'You cannot close your own account here');
    const u = await this.user(id);
    if (this.closed.has(id) || u.closedAt) throw new AdminError('conflict', 'This account is already closed');
    if (isStaff(this.roleOf(id))) throw new AdminError('conflict', 'Remove the staff role first');
    const note = text(input.note, 1000);
    const at = this.now();
    // Mark closed first: the fair-play ban hook below sees it and does not close twice.
    this.closed.set(id, reason);
    await closeUserAccount(this.db, id, { reason, note: note || null, by: actor.username, at: new Date(at) });
    await this.auth.store.revokeUserSessions(id, at);
    let refunds: { playerId: string; points: number; category: string; gameId: string }[] = [];
    if (reason === 'fair_play' && !this.b.fairPlay.isBanned(id)) {
      refunds = this.b.fairPlay.ban(id, actor.username, note || 'Fair play violation')?.refunds ?? [];
    }
    this.b.disconnect(id, reason === 'fair_play' ? 4010 : CLOSE_ACCOUNT_CLOSED, reason === 'fair_play' ? 'account closed for fair play violation' : 'account closed');
    const refunded = refunds.reduce((s, r) => s + r.points, 0);
    await this.audit(actor, 'account.close', { type: 'user', id, name: u.username }, note || reason, {
      reason,
      refunds: refunds.length,
      refundedPoints: Math.round(refunded * 10) / 10,
    });
    return { ok: true, refunds };
  }

  async reopenAccount(actor: Actor, id: string, input: { note?: unknown }) {
    this.require(actor, 'accounts.reopen');
    const u = await this.user(id);
    if (!this.closed.has(id) && !u.closedAt) throw new AdminError('conflict', 'This account is open');
    const note = text(input.note, 1000);
    await reopenUserAccount(this.db, id);
    this.closed.delete(id);
    if (this.b.fairPlay.isBanned(id)) this.b.fairPlay.unban(id, actor.username, note || 'Account reopened');
    await this.audit(actor, 'account.reopen', { type: 'user', id, name: u.username }, note, { previousReason: u.closedReason });
    return { ok: true };
  }

  /**
   * Called when the fair-play service bans an account by another path (the
   * legacy token API): persist the closure so it survives a restart.
   */
  onFairPlayBan(playerId: string) {
    if (this.closed.has(playerId)) return;
    this.closed.set(playerId, 'fair_play');
    void (async () => {
      const u = await getUser(this.db, playerId);
      if (!u) return;
      await closeUserAccount(this.db, playerId, { reason: 'fair_play', note: 'Closed through the fair-play API', by: 'fair-play API', at: new Date(this.now()) });
      await this.auth.store.revokeUserSessions(playerId, this.now());
      await this.audit(SYSTEM, 'account.close', { type: 'user', id: playerId, name: u.username }, 'Closed through the fair-play API', { reason: 'fair_play' });
    })().catch((e) => this.log(`could not record fair-play closure of ${playerId}: ${String(e)}`));
  }

  // ---------------------------------------------------------------- reports

  private reportView(r: Report): AdminReport {
    const m = this.b.moderation;
    return { ...r, targetReportCount: m.reportCountFor(r.targetId), targetChatBan: m.activeBan(r.targetId) ?? null };
  }

  reports(actor: Actor, status: string): AdminReport[] {
    this.require(actor, 'reports.view');
    return this.b.moderation.store
      .listReports()
      .filter((r) => status === 'all' || r.status === (status || 'open'))
      .sort((a, b) => (status === 'open' || !status ? a.createdAt - b.createdAt : b.createdAt - a.createdAt))
      .map((r) => this.reportView(r));
  }

  async resolveReport(actor: Actor, id: string, input: { action?: unknown; note?: unknown; hours?: unknown; message?: unknown }) {
    this.require(actor, 'reports.resolve');
    const r = this.b.moderation.store.getReport(id);
    if (!r) throw new AdminError('not_found', 'No such report');
    const action = input.action as ReportAction;
    if (!['dismiss', 'warn', 'chat_ban', 'unban'].includes(action)) throw new AdminError('invalid_input', 'Unknown action');
    const note = text(input.note, 500);
    if (action === 'warn') {
      const message = text(input.message, 500) || defaultWarning(r.reason);
      await insertWarning(this.db, { userId: r.targetId, category: r.reason, message, issuedBy: actor.id, issuedByName: actor.username, reportId: r.id }).catch(() => undefined);
      this.b.notifications.notify(r.targetId, { kind: 'system', title: 'Warning from ChessMate moderators', body: message, url: null, data: { reportId: r.id } });
    }
    if (action === 'chat_ban') this.require(actor, 'players.mute');
    const hours = Number(input.hours) > 0 ? Number(input.hours) : 24;
    const updated = this.b.moderation.resolve(id, action, { note, by: actor.username, durationHours: hours });
    await this.audit(actor, `report.${action}`, { type: 'report', id, name: r.targetName }, note, {
      targetId: r.targetId,
      reason: r.reason,
      ...(action === 'chat_ban' ? { hours } : {}),
    });
    return { report: updated && this.reportView(updated) };
  }

  // ---------------------------------------------------------------- fair play

  private caseView(c: FairPlayCase, username: string): AdminFairPlayCase {
    const cheating = this.b.moderation.store.listReports().filter((r) => r.targetId === c.playerId && r.reason === 'cheating').length;
    return {
      playerId: c.playerId,
      username,
      status: c.status,
      score: c.score,
      reasons: [...c.reasons],
      assessment: c.assessment && { ...c.assessment, reasons: [...c.assessment.reasons] },
      openedAt: c.openedAt,
      updatedAt: c.updatedAt,
      cheatingReports: cheating,
    };
  }

  async fairPlayQueue(actor: Actor, status: string): Promise<AdminFairPlayCase[]> {
    this.require(actor, 'fairplay.view');
    const s = status === 'dismissed' || status === 'banned' ? status : 'open';
    const cases = this.b.fairPlay.queue(s);
    const names = await this.usernames(cases.map((c) => c.playerId));
    return cases.map((c) => this.caseView(c, names.get(c.playerId) ?? c.playerId));
  }

  async fairPlayFile(actor: Actor, playerId: string): Promise<AdminFairPlayFile> {
    this.require(actor, 'fairplay.view');
    const f = this.b.fairPlay.caseFile(playerId);
    const u = await getUser(this.db, playerId);
    const name = u?.username ?? f.player?.name ?? playerId;
    return {
      player: u && !u.deletedAt ? this.summary(actor, u) : null,
      case: f.case ? this.caseView(f.case, name) : null,
      ban: f.ban && { reason: f.ban.reason, bannedAt: f.ban.bannedAt, by: f.ban.by, refunds: f.ban.refunds },
      reports: [...f.reports].reverse().map(({ playerId: _p, ...r }) => r),
      log: f.audit.map((e) => ({ at: e.at, action: e.action, by: e.by, note: e.note })),
      analysisEnabled: this.b.analysisEnabled,
    };
  }

  async openFairPlayCase(actor: Actor, playerId: string, input: { note?: unknown }) {
    this.require(actor, 'fairplay.review');
    const u = await this.user(playerId);
    const note = text(input.note, 2000);
    const c = this.b.fairPlay.report(playerId, actor.username, note || undefined);
    await this.audit(actor, 'fairplay.open', { type: 'case', id: playerId, name: u.username }, note);
    return { case: this.caseView(c, u.username) };
  }

  async dismissFairPlay(actor: Actor, playerId: string, input: { note?: unknown }) {
    this.require(actor, 'fairplay.review');
    const note = text(input.note, 2000);
    const c = this.b.fairPlay.dismiss(playerId, actor.username, note || undefined);
    if (!c) throw new AdminError('conflict', 'No open case for this player');
    const names = await this.usernames([playerId]);
    await this.audit(actor, 'fairplay.dismiss', { type: 'case', id: playerId, name: names.get(playerId) ?? playerId }, note, { score: c.score });
    return { case: this.caseView(c, names.get(playerId) ?? playerId) };
  }

  // ---------------------------------------------------------------- games

  private gameSummary(g: GameRow): AdminGameSummary {
    const live = !!this.b.room(g.id) && !this.b.room(g.id)!.outcome;
    return {
      id: g.id,
      white: { id: g.whiteUserId, name: g.whiteName, ratingBefore: g.whiteRatingBefore, ratingAfter: g.whiteRatingAfter, accuracy: g.whiteAccuracy },
      black: { id: g.blackUserId, name: g.blackName, ratingBefore: g.blackRatingBefore, ratingAfter: g.blackRatingAfter, accuracy: g.blackAccuracy },
      category: g.timeCategory,
      initialMs: g.initialMs,
      incrementMs: g.incrementMs,
      rated: g.rated,
      status: live ? 'active' : g.status,
      result: g.result,
      endReason: g.endReason,
      plyCount: g.plyCount,
      startedAt: g.startedAt.getTime(),
      endedAt: g.endedAt?.getTime() ?? null,
      live,
    };
  }

  async games(actor: Actor, q: { player?: string; before?: number; limit?: number }): Promise<AdminGameSummary[]> {
    this.require(actor, 'games.view');
    let userId = q.player?.trim() || undefined;
    if (userId && !UUID.test(userId)) userId = (await findUserByUsername(this.db, userId))?.id ?? userId;
    const rows = await listRecentGames(this.db, { userId, limit: q.limit, before: q.before ? new Date(q.before) : undefined });
    return rows.map((g) => this.gameSummary(g));
  }

  async game(actor: Actor, id: string): Promise<AdminGameDetail> {
    this.require(actor, 'games.view');
    const room = this.b.room(id);
    const chat: ChatLine[] = this.b.moderation.chatLog(id);
    const row = await getGame(this.db, id);
    if (row) {
      return {
        ...this.gameSummary(row),
        initialFen: row.initialFen,
        finalFen: room ? room.game.fen : row.finalFen,
        pgn: row.pgn,
        moves: room ? room.game.history().map((m) => m.san) : row.moves.map((m) => m.san),
        chat,
        spectators: this.b.spectators(id),
      };
    }
    if (!room) throw new AdminError('not_found', 'No such game');
    // Guest games are not stored: show the live room.
    const now = this.now();
    return {
      id,
      white: { id: room.white.id, name: room.white.name, ratingBefore: room.white.rating, ratingAfter: null, accuracy: null },
      black: { id: room.black.id, name: room.black.name, ratingBefore: room.black.rating, ratingAfter: null, accuracy: null },
      category: timeCategory(room.timeControl),
      initialMs: room.timeControl.initialMs,
      incrementMs: room.timeControl.incrementMs,
      rated: room.rated,
      status: room.outcome ? (room.outcome.reason === 'aborted' ? 'aborted' : 'finished') : 'active',
      result: room.outcome?.result ?? '*',
      endReason: room.outcome?.reason ?? null,
      plyCount: room.game.ply,
      startedAt: room.createdAt,
      endedAt: room.outcome ? now : null,
      live: !room.outcome,
      initialFen: room.initialFen,
      finalFen: room.game.fen,
      pgn: null,
      moves: room.game.history().map((m) => m.san),
      chat,
      spectators: this.b.spectators(id),
    };
  }

  async abortGame(actor: Actor, id: string, input: { reason?: unknown }) {
    this.require(actor, 'games.abort');
    const room = this.b.room(id);
    if (!room || room.outcome) throw new AdminError('conflict', 'This game is not being played right now');
    const reason = text(input.reason, 300);
    if (!reason) throw new AdminError('invalid_input', 'Give a reason');
    this.b.terminate(id);
    await this.audit(actor, 'game.abort', { type: 'game', id, name: `${room.white.name} vs ${room.black.name}` }, reason, { ply: room.game.ply });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private async usernames(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids)) {
      const u = await getUser(this.db, id);
      if (u) out.set(id, u.username);
    }
    return out;
  }
}


function toAudit(r: AdminAuditRow): AdminAuditEntry {
  return {
    id: r.id,
    at: r.createdAt.getTime(),
    actorId: r.actorId,
    actorName: r.actorName,
    action: r.action,
    targetType: r.targetType as AdminAuditEntry['targetType'],
    targetId: r.targetId,
    targetName: r.targetName,
    reason: r.reason,
    details: r.details,
  };
}

function defaultWarning(reason: string): string {
  switch (reason) {
    case 'abusive_chat':
      return 'Your chat in a recent game broke our community rules. Please keep chat respectful. Repeated abuse leads to a chat ban or account closure.';
    case 'spam':
      return 'Please do not spam or advertise in chat. Repeated spam leads to a chat ban.';
    case 'offensive_name':
      return 'Your username breaks our community rules. Please contact support to change it, or it will be changed for you.';
    case 'unsporting':
      return 'Leaving or stalling in lost games is unsporting. Please resign or play on. Repeated stalling can lead to restrictions.';
    case 'cheating':
      return 'Using outside help during games is not allowed. Your games are being reviewed by our fair play team.';
    default:
      return 'A moderator reviewed a report about your behaviour. Please follow the ChessMate community rules.';
  }
}
