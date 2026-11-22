import {
  EVENT_LIMITS,
  Game,
  LICHESS_ORIGIN,
  cleanEventApplication,
  cleanEventInput,
  cleanEventNews,
  cleanPlayerInput,
  cleanRoundInput,
  computeStandings,
  eventStatusOf,
  gameStatusOf,
  hasPermission,
  isChessTitle,
  lichessTourToEvent,
  parseBroadcastPgn,
  roundStatusOf,
  type BroadcastPgnGame,
  type ChessTitle,
  type EventApplicationView,
  type EventDetail,
  type EventFormat,
  type EventGameDetail,
  type EventGameSummary,
  type EventPlayerView,
  type EventRoundView,
  type EventSummary,
  type GameResult,
  type MoveClass,
  type Score,
  type LichessBroadcastRound,
  type LichessBroadcastTour,
  type StaffRole,
} from '@chessmate/core';
import {
  addOrganizer,
  countEventApplicationsSince,
  deleteEvent,
  deleteEventNews,
  deleteGame,
  deleteGamesExcept,
  deletePlayer,
  deleteRound,
  findEventByExternal,
  findUserByUsername,
  getAppSetting,
  getEvent,
  getEventApplication,
  getEventCover,
  getEventLogo,
  getEventNewsImage,
  getEventNews,
  getBroadcastGame,
  getPlayer,
  getRound,
  insertAudit,
  insertEvent,
  insertEventApplication,
  insertEventNews,
  insertPlayers,
  insertRound,
  listAllOrganizers,
  listEventApplications,
  listEventNews,
  listEvents,
  listGameSummaries,
  listOrganizers,
  listPlayers,
  listRounds,
  removeOrganizer,
  reviewEventApplication,
  setAppSetting,
  updateEvent,
  updateGame,
  updatePlayer,
  updateGameFeds,
  updateRound,
  upsertGames,
  type BroadcastRoundRow,
  type Database,
  type EventApplicationWithUser,
  type EventListRow,
  type GameSummaryRow,
  type NewBroadcastGame,
  type PlayerWithUser,
} from '@chessmate/db';

import { WatchError, fail } from './errors';

export interface EventServiceOptions {
  db: Database;
  now?: () => number;
  roleOf: (userId: string) => StaffRole;
  usernameOf?: (userId: string) => string | undefined;
}

export interface EventHooks {
  notify(userId: string, title: string, body: string, url: string | null): void;
  /** New moves or results in these games (live analysis picks them up). */
  gamesChanged?(ids: string[]): void;
}

export interface WatchSettings {
  /** Import Lichess's official broadcasts automatically. */
  lichessImport: boolean;
}

/** Result of applying a PGN file to a round. */
export interface PgnApplyResult {
  games: number;
  changed: number;
  /** Every game in the round has a result. */
  allFinished: boolean;
}

const DETAIL_TTL_MS = 2_000;
const LIST_TTL_MS = 8_000;
const SETTINGS_KEY = 'watch.settings';
const RESULTS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];

/** Everything about an event that does not depend on who is looking. */
interface Built {
  row: EventListRow;
  summary: EventSummary;
  detail: Omit<EventDetail, 'canManage' | 'organizers'>;
  sources: Map<string, NonNullable<EventRoundView['source']>>;
}

const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9À-ɏЀ-ӿ؀-ۿ]+/g, ' ').trim();
const title = (v: string | null): ChessTitle | null => (v && isChessTitle(v) ? v : null);

function gameSummary(g: GameSummaryRow): EventGameSummary {
  return {
    id: g.id,
    roundId: g.roundId,
    board: g.board,
    white: { name: g.whiteName, title: title(g.whiteTitle), rating: g.whiteRating, federation: g.whiteFed, playerId: g.whitePlayerId },
    black: { name: g.blackName, title: title(g.blackTitle), rating: g.blackRating, federation: g.blackFed, playerId: g.blackPlayerId },
    result: (RESULTS.includes(g.result as GameResult) ? g.result : '*') as GameResult,
    status: gameStatusOf(g.result as GameResult, g.ply),
    fen: g.fen,
    lastMove: g.lastMove,
    ply: g.ply,
    whiteClockMs: g.whiteClockMs,
    blackClockMs: g.blackClockMs,
    clockAt: g.clockAt?.getTime() ?? null,
    evalScore: (g.evalScore as Score | null) ?? null,
    lastGrade: (g.lastGrade as MoveClass | null) ?? null,
  };
}

const playerView = (p: PlayerWithUser): EventPlayerView => ({
  id: p.id,
  name: p.name,
  title: title(p.title),
  rating: p.rating,
  federation: p.federation,
  fideId: p.fideId,
  userId: p.userId,
  username: p.username,
});

const appView = (a: EventApplicationWithUser): EventApplicationView => ({
  id: a.id,
  userId: a.userId,
  username: a.username,
  displayName: a.displayName || a.username,
  eventName: a.eventName,
  organization: a.organization,
  website: a.website,
  location: a.location,
  startsAt: a.startsAt.getTime(),
  endsAt: a.endsAt.getTime(),
  description: a.description,
  coverage: a.coverage,
  status: a.status as EventApplicationView['status'],
  note: a.note,
  eventId: a.eventId,
  createdAt: a.createdAt.getTime(),
  reviewedAt: a.reviewedAt?.getTime() ?? null,
});

/** Last known clock of each side from per-ply clocks (white moves on even indexes). */
export function lastClocks(clocks: (number | null)[]): { w: number | null; b: number | null } {
  let w: number | null = null;
  let b: number | null = null;
  for (let i = clocks.length - 1; i >= 0 && (w === null || b === null); i--) {
    const c = clocks[i];
    if (c == null) continue;
    if (i % 2 === 0 && w === null) w = c;
    if (i % 2 === 1 && b === null) b = c;
  }
  return { w, b };
}

/**
 * Broadcast events. Staff with `broadcasts.manage` manage every event; an
 * organiser manages only the events they were added to. Everyone sees
 * published events that are not hidden.
 */
export class EventService {
  private hooks: EventHooks = { notify: () => {} };
  private readonly organizers = new Map<string, Set<string>>();
  private readonly built = new Map<string, { at: number; value: Built }>();
  /** When someone last looked at each event (sync follows watched events first). */
  private readonly viewedAt = new Map<string, number>();
  private listCache: { at: number; rows: EventListRow[] } | null = null;
  private settingsCache: WatchSettings | null = null;

  constructor(private readonly opts: EventServiceOptions) {}

  attach(hooks: EventHooks) {
    this.hooks = hooks;
  }

  async load(): Promise<void> {
    this.organizers.clear();
    for (const o of await listAllOrganizers(this.db)) {
      const set = this.organizers.get(o.eventId) ?? new Set<string>();
      set.add(o.userId);
      this.organizers.set(o.eventId, set);
    }
  }

  private get db() {
    return this.opts.db;
  }

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  isAdmin(userId: string | null): boolean {
    return !!userId && hasPermission(this.opts.roleOf(userId), 'broadcasts.manage');
  }

  canManage(userId: string | null, eventId: string): boolean {
    return !!userId && (this.isAdmin(userId) || !!this.organizers.get(eventId)?.has(userId));
  }

  private requireAdmin(userId: string) {
    if (!this.isAdmin(userId)) throw new WatchError(403, 'Only ChessMate admins can do that');
  }

  private requireManager(userId: string, eventId: string) {
    if (!this.canManage(userId, eventId)) throw new WatchError(403, 'You cannot manage this event');
  }

  /** Forget cached views of an event (after any change). */
  invalidate(eventId: string) {
    this.built.delete(eventId);
    this.listCache = null;
  }

  private async audit(actorId: string, action: string, target: { id: string; name: string }, details: Record<string, unknown> = {}) {
    await insertAudit(this.db, {
      actorId,
      actorName: this.opts.usernameOf?.(actorId) ?? actorId,
      action,
      targetType: 'system',
      targetId: target.id,
      targetName: target.name,
      reason: null,
      details,
      at: new Date(this.now()),
    }).catch((e) => console.warn('watch audit failed', e));
  }

  // -------------------------------------------------------------------------
  // Reading

  private async build(eventId: string): Promise<Built | null> {
    const hit = this.built.get(eventId);
    if (hit && this.now() - hit.at < DETAIL_TTL_MS) return hit.value;
    const row = await getEvent(this.db, eventId);
    if (!row) return null;
    const [rounds, games, players, news] = await Promise.all([listRounds(this.db, eventId), listGameSummaries(this.db, eventId), listPlayers(this.db, eventId), listEventNews(this.db, eventId)]);
    const now = this.now();
    const byRound = new Map<string, EventGameSummary[]>();
    for (const g of games) {
      const list = byRound.get(g.roundId) ?? [];
      list.push(gameSummary(g));
      byRound.set(g.roundId, list);
    }
    const sources = new Map<string, NonNullable<EventRoundView['source']>>();
    const roundViews: EventRoundView[] = rounds.map((r) => {
      const gs = byRound.get(r.id) ?? [];
      sources.set(r.id, {
        kind: r.sourceKind as NonNullable<EventRoundView['source']>['kind'],
        url: r.sourceUrl,
        lichessRoundId: r.lichessRoundId,
        lastSyncAt: r.lastSyncAt?.getTime() ?? null,
        syncError: r.syncError,
      });
      return { id: r.id, number: r.number, name: r.name, startsAt: r.startsAt?.getTime() ?? null, status: roundStatusOf(gs, r.startsAt?.getTime() ?? null, now), games: gs };
    });
    const status = eventStatusOf({ startsAt: row.startsAt.getTime(), endsAt: row.endsAt.getTime() }, roundViews, now);
    const playerViews = players.map(playerView);
    const standings = computeStandings(
      playerViews,
      games.map((g) => ({
        white: { name: g.whiteName, playerId: g.whitePlayerId, rating: g.whiteRating },
        black: { name: g.blackName, playerId: g.blackPlayerId, rating: g.blackRating },
        result: g.result as GameResult,
      })),
    );
    const live = roundViews.find((r) => r.status === 'live');
    const next = roundViews.find((r) => r.status === 'upcoming');
    const current = live ?? next ?? roundViews[roundViews.length - 1] ?? null;
    const summary: EventSummary = {
      id: row.id,
      name: row.name,
      shortDescription: row.shortDescription,
      location: row.location,
      startsAt: row.startsAt.getTime(),
      endsAt: row.endsAt.getTime(),
      format: row.format as EventFormat,
      timeControl: row.timeControl,
      status,
      featured: row.featured,
      published: row.published,
      hidden: row.hidden,
      source: row.source as EventSummary['source'],
      sourceUrl: row.sourceUrl,
      logoPath: row.logoUrl ?? (row.hasLogo ? `/api/watch/events/${row.id}/logo?v=${row.updatedAt.getTime()}` : null),
      coverPath: row.hasCover ? `/api/watch/events/${row.id}/cover?v=${row.updatedAt.getTime()}` : null,
      playerCount: playerViews.length || standings.length,
      roundCount: roundViews.length,
      liveGames: games.filter((g) => g.result === '*' && g.ply > 0).length,
      currentRound: current ? { id: current.id, number: current.number, name: current.name } : null,
    };
    const value: Built = {
      row,
      summary,
      sources,
      detail: {
        ...summary,
        description: row.description,
        website: row.website,
        links: row.links ?? [],
        rounds: roundViews,
        players: playerViews,
        standings,
        news: news.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          imagePath: n.hasImage ? `/api/watch/news/${n.id}/image` : null,
          links: n.links ?? [],
          author: n.authorId && n.username ? { id: n.authorId, username: n.username, displayName: n.displayName || n.username } : null,
          createdAt: n.createdAt.getTime(),
        })),
      },
    };
    this.built.set(eventId, { at: now, value });
    return value;
  }

  private visible(b: Built, viewer: string | null) {
    return (b.row.published && !b.row.hidden) || this.canManage(viewer, b.row.id);
  }

  /** Events for the Watch screen: live, upcoming and recently finished; plus the ones the viewer manages. */
  async list(viewer: string | null): Promise<{ live: EventSummary[]; upcoming: EventSummary[]; recent: EventSummary[]; managed: EventSummary[] }> {
    if (!this.listCache || this.now() - this.listCache.at > LIST_TTL_MS) {
      this.listCache = { at: this.now(), rows: await listEvents(this.db, { endedAfter: new Date(this.now() - 45 * 86_400_000) }) };
    }
    const out = { live: [] as EventSummary[], upcoming: [] as EventSummary[], recent: [] as EventSummary[], managed: [] as EventSummary[] };
    for (const r of this.listCache.rows) {
      const b = await this.build(r.id);
      if (!b) continue;
      if (this.canManage(viewer, r.id) && (!this.isAdmin(viewer) || r.source === 'chessmate')) out.managed.push(b.summary);
      if (!(b.row.published && !b.row.hidden)) continue;
      out[b.summary.status === 'live' ? 'live' : b.summary.status === 'upcoming' ? 'upcoming' : 'recent'].push(b.summary);
    }
    const featuredFirst = (a: EventSummary, b: EventSummary) => Number(b.featured) - Number(a.featured);
    out.live.sort((a, b) => featuredFirst(a, b) || b.liveGames - a.liveGames);
    out.upcoming.sort((a, b) => featuredFirst(a, b) || a.startsAt - b.startsAt);
    out.recent.sort((a, b) => b.endsAt - a.endsAt);
    out.recent = out.recent.slice(0, 30);
    return out;
  }

  /** Every event (admin console), newest first, including hidden and unpublished ones. */
  async adminList(viewer: string): Promise<EventSummary[]> {
    this.requireAdmin(viewer);
    const rows = await listEvents(this.db);
    const out: EventSummary[] = [];
    for (const r of rows) {
      const b = await this.build(r.id);
      if (b) out.push(b.summary);
    }
    return out;
  }

  /** When someone last opened this event or one of its games (0: not lately). */
  lastViewed(eventId: string): number {
    return this.viewedAt.get(eventId) ?? 0;
  }

  async detail(viewer: string | null, eventId: string): Promise<EventDetail> {
    this.viewedAt.set(eventId, this.now());
    const b = await this.build(eventId);
    if (!b || !this.visible(b, viewer)) throw new WatchError(404, 'Event not found');
    const manage = this.canManage(viewer, eventId);
    if (!manage) return { ...b.detail, canManage: false };
    return {
      ...b.detail,
      canManage: true,
      rounds: b.detail.rounds.map((r) => ({ ...r, source: b.sources.get(r.id) })),
      organizers: (await listOrganizers(this.db, eventId)).map((o) => ({ userId: o.userId, username: o.username, displayName: o.displayName || o.username })),
    };
  }

  async game(viewer: string | null, gameId: string): Promise<EventGameDetail> {
    const g = await getBroadcastGame(this.db, gameId);
    if (!g) throw new WatchError(404, 'Game not found');
    this.viewedAt.set(g.eventId, this.now());
    const b = await this.build(g.eventId);
    if (!b || !this.visible(b, viewer)) throw new WatchError(404, 'Game not found');
    const round = b.detail.rounds.find((r) => r.id === g.roundId);
    return {
      ...gameSummary(g),
      eventId: g.eventId,
      eventName: b.row.name,
      roundName: round?.name ?? '',
      initialFen: g.initialFen,
      moves: g.moves,
      clocks: g.clocks,
      analysis: {
        scores: g.evals.map((e) => (e ? (e.s as Score) : null)),
        best: g.evals.map((e) => e?.b ?? null),
        grades: g.grades.map((x) => (x as MoveClass | null) ?? null),
      },
    };
  }

  async cover(eventId: string): Promise<{ mime: string; data: Buffer; etag: string } | null> {
    const r = await getEventCover(this.db, eventId);
    const m = r?.cover ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(r.cover) : null;
    if (!r || !m) return null;
    return { mime: m[1]!, data: Buffer.from(m[2]!, 'base64'), etag: `"c${r.updatedAt.getTime()}"` };
  }

  /** Pictures of event news never change (a post is replaced, not edited). */
  async newsImage(newsId: string): Promise<{ mime: string; data: Buffer; etag: string } | null> {
    const image = await getEventNewsImage(this.db, newsId);
    const m = image ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(image) : null;
    if (!m) return null;
    return { mime: m[1]!, data: Buffer.from(m[2]!, 'base64'), etag: `"n${newsId}"` };
  }

  async logo(eventId: string): Promise<{ mime: string; data: Buffer; etag: string } | null> {
    const r = await getEventLogo(this.db, eventId);
    const m = r?.logo ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(r.logo) : null;
    if (!r || !m) return null;
    return { mime: m[1]!, data: Buffer.from(m[2]!, 'base64'), etag: `"${r.updatedAt.getTime()}"` };
  }

  // -------------------------------------------------------------------------
  // Events

  async create(viewer: string, raw: unknown): Promise<EventDetail> {
    this.requireAdmin(viewer);
    const input = cleanEventInput(raw);
    if ('error' in input) fail(input);
    const v = input.value;
    const row = await insertEvent(this.db, {
      name: v.name,
      shortDescription: v.shortDescription,
      description: v.description,
      location: v.location,
      startsAt: new Date(v.startsAt),
      endsAt: new Date(v.endsAt),
      format: v.format,
      timeControl: v.timeControl,
      website: v.website,
      logo: v.logo ?? null,
      cover: v.cover ?? null,
      links: v.links,
      createdBy: viewer,
    });
    this.listCache = null;
    await this.audit(viewer, 'event.create', { id: row.id, name: row.name });
    return this.detail(viewer, row.id);
  }

  async update(viewer: string, eventId: string, raw: unknown): Promise<EventDetail> {
    this.requireManager(viewer, eventId);
    const input = cleanEventInput(raw);
    if ('error' in input) fail(input);
    const v = input.value;
    const row = await updateEvent(this.db, eventId, {
      name: v.name,
      shortDescription: v.shortDescription,
      description: v.description,
      location: v.location,
      startsAt: new Date(v.startsAt),
      endsAt: new Date(v.endsAt),
      format: v.format,
      timeControl: v.timeControl,
      website: v.website,
      links: v.links,
      ...(v.logo !== undefined ? { logo: v.logo } : {}),
      ...(v.cover !== undefined ? { cover: v.cover } : {}),
    });
    if (!row) throw new WatchError(404, 'Event not found');
    this.invalidate(eventId);
    return this.detail(viewer, eventId);
  }

  /** Publish or unpublish (managers); feature or hide (admins). */
  async setFlags(viewer: string, eventId: string, raw: { published?: unknown; featured?: unknown; hidden?: unknown }): Promise<EventDetail> {
    this.requireManager(viewer, eventId);
    const patch: { published?: boolean; featured?: boolean; hidden?: boolean } = {};
    if (typeof raw.published === 'boolean') patch.published = raw.published;
    if (typeof raw.featured === 'boolean' || typeof raw.hidden === 'boolean') {
      this.requireAdmin(viewer);
      if (typeof raw.featured === 'boolean') patch.featured = raw.featured;
      if (typeof raw.hidden === 'boolean') patch.hidden = raw.hidden;
    }
    if (!Object.keys(patch).length) throw new WatchError(400, 'Nothing to change');
    const row = await updateEvent(this.db, eventId, patch);
    if (!row) throw new WatchError(404, 'Event not found');
    this.invalidate(eventId);
    if (patch.hidden !== undefined || patch.featured !== undefined) await this.audit(viewer, patch.hidden ? 'event.hide' : patch.hidden === false ? 'event.unhide' : 'event.feature', { id: eventId, name: row.name }, patch);
    return this.detail(viewer, eventId);
  }

  async remove(viewer: string, eventId: string): Promise<void> {
    this.requireAdmin(viewer);
    const row = await getEvent(this.db, eventId);
    if (!row || !(await deleteEvent(this.db, eventId))) throw new WatchError(404, 'Event not found');
    this.organizers.delete(eventId);
    this.invalidate(eventId);
    await this.audit(viewer, 'event.delete', { id: eventId, name: row.name });
  }

  // Organisers

  async addOrganizer(viewer: string, eventId: string, username: unknown): Promise<EventDetail> {
    this.requireManager(viewer, eventId);
    const name = typeof username === 'string' ? username.trim().replace(/^@/, '') : '';
    const user = name ? await findUserByUsername(this.db, name) : undefined;
    if (!user) throw new WatchError(404, 'No player with that username', 'username');
    const set = this.organizers.get(eventId) ?? new Set<string>();
    if (set.has(user.id)) throw new WatchError(409, 'Already an organiser');
    if (set.size >= EVENT_LIMITS.organizers) throw new WatchError(409, `At most ${EVENT_LIMITS.organizers} organisers`);
    await addOrganizer(this.db, eventId, user.id, viewer);
    set.add(user.id);
    this.organizers.set(eventId, set);
    this.invalidate(eventId);
    const e = await getEvent(this.db, eventId);
    this.hooks.notify(user.id, 'You can manage an event', `You were added as an organiser of ${e?.name ?? 'an event'}.`, `/watch/events/${eventId}`);
    return this.detail(viewer, eventId);
  }

  /** Returns the event, or null when organisers removed themselves and can no longer manage it. */
  async removeOrganizer(viewer: string, eventId: string, userId: string): Promise<EventDetail | null> {
    this.requireManager(viewer, eventId);
    await removeOrganizer(this.db, eventId, userId);
    this.organizers.get(eventId)?.delete(userId);
    this.invalidate(eventId);
    return this.canManage(viewer, eventId) ? this.detail(viewer, eventId) : null;
  }

  // Players

  private async playerFields(raw: unknown) {
    const input = cleanPlayerInput(raw);
    if ('error' in input) fail(input);
    const v = input.value;
    let userId: string | null = null;
    if (v.username) {
      const u = await findUserByUsername(this.db, v.username);
      if (!u) throw new WatchError(404, 'No ChessMate player with that username', 'username');
      userId = u.id;
    }
    return { name: v.name, title: v.title, rating: v.rating, federation: v.federation, fideId: v.fideId, userId };
  }

  async addPlayer(viewer: string, eventId: string, raw: unknown): Promise<EventDetail> {
    this.requireManager(viewer, eventId);
    if ((await listPlayers(this.db, eventId)).length >= EVENT_LIMITS.players) throw new WatchError(409, 'This event has the most players allowed');
    await insertPlayers(this.db, [{ eventId, ...(await this.playerFields(raw)) }]);
    this.invalidate(eventId);
    return this.detail(viewer, eventId);
  }

  private async playerEvent(playerId: string) {
    return (await getPlayer(this.db, playerId))?.eventId ?? null;
  }

  async updatePlayer(viewer: string, playerId: string, raw: unknown): Promise<EventDetail> {
    const eventId = await this.playerEvent(playerId);
    if (!eventId) throw new WatchError(404, 'Player not found');
    this.requireManager(viewer, eventId);
    await updatePlayer(this.db, playerId, await this.playerFields(raw));
    this.invalidate(eventId);
    return this.detail(viewer, eventId);
  }

  async removePlayer(viewer: string, playerId: string): Promise<EventDetail> {
    const eventId = await this.playerEvent(playerId);
    if (!eventId) throw new WatchError(404, 'Player not found');
    this.requireManager(viewer, eventId);
    await deletePlayer(this.db, playerId);
    this.invalidate(eventId);
    return this.detail(viewer, eventId);
  }

  // Rounds

  private async roundOf(viewer: string, roundId: string): Promise<BroadcastRoundRow> {
    const r = await getRound(this.db, roundId);
    if (!r) throw new WatchError(404, 'Round not found');
    this.requireManager(viewer, r.eventId);
    return r;
  }

  async addRound(viewer: string, eventId: string, raw: unknown): Promise<EventDetail> {
    this.requireManager(viewer, eventId);
    const input = cleanRoundInput(raw);
    if ('error' in input) fail(input);
    const v = input.value;
    if ((await listRounds(this.db, eventId)).length >= EVENT_LIMITS.rounds) throw new WatchError(409, 'This event has the most rounds allowed');
    await insertRound(this.db, {
      eventId,
      number: v.number,
      name: v.name,
      startsAt: v.startsAt === null ? null : new Date(v.startsAt),
      sourceKind: v.source.kind,
      sourceUrl: v.source.url,
      lichessRoundId: v.source.lichessRoundId,
    });
    this.invalidate(eventId);
    return this.detail(viewer, eventId);
  }

  async updateRound(viewer: string, roundId: string, raw: unknown): Promise<EventDetail> {
    const r = await this.roundOf(viewer, roundId);
    const input = cleanRoundInput(raw);
    if ('error' in input) fail(input);
    const v = input.value;
    await updateRound(this.db, roundId, {
      number: v.number,
      name: v.name,
      startsAt: v.startsAt === null ? null : new Date(v.startsAt),
      sourceKind: v.source.kind,
      sourceUrl: v.source.url,
      lichessRoundId: v.source.lichessRoundId,
      // A changed source starts syncing again.
      sourceFinished: false,
      syncError: null,
    });
    this.invalidate(r.eventId);
    return this.detail(viewer, r.eventId);
  }

  async removeRound(viewer: string, roundId: string): Promise<EventDetail> {
    const r = await this.roundOf(viewer, roundId);
    await deleteRound(this.db, roundId);
    this.invalidate(r.eventId);
    return this.detail(viewer, r.eventId);
  }

  /** "Sync now": the next sync tick fetches this round again. */
  async resumeSync(viewer: string, roundId: string): Promise<BroadcastRoundRow> {
    const r = await this.roundOf(viewer, roundId);
    if (r.sourceKind === 'manual') throw new WatchError(400, 'This round has no live source');
    await updateRound(this.db, roundId, { sourceFinished: false, syncError: null });
    this.invalidate(r.eventId);
    return { ...r, sourceFinished: false, syncError: null };
  }

  // Games

  /** Pasted PGN from a manager: adds or updates games by board. */
  async pastePgn(viewer: string, roundId: string, raw: { pgn?: unknown; replace?: unknown }): Promise<PgnApplyResult> {
    const r = await this.roundOf(viewer, roundId);
    const pgn = typeof raw.pgn === 'string' ? raw.pgn : '';
    if (!pgn.trim()) throw new WatchError(400, 'Paste the PGN of the games', 'pgn');
    if (pgn.length > EVENT_LIMITS.pgnChars) throw new WatchError(400, 'This PGN is too large', 'pgn');
    const res = await this.applyPgn(r, pgn, { replace: raw.replace === true });
    if (!res.games) throw new WatchError(400, 'No games could be read from this PGN', 'pgn');
    return res;
  }

  /** A pairing without moves (events that only publish results). */
  async addPairing(viewer: string, roundId: string, raw: { white?: unknown; black?: unknown; board?: unknown; result?: unknown }): Promise<EventDetail> {
    const r = await this.roundOf(viewer, roundId);
    const white = typeof raw.white === 'string' ? raw.white.trim().slice(0, 80) : '';
    const black = typeof raw.black === 'string' ? raw.black.trim().slice(0, 80) : '';
    if (white.length < 2 || black.length < 2) throw new WatchError(400, 'Enter both players', white.length < 2 ? 'white' : 'black');
    const existing = (await listGameSummaries(this.db, r.eventId)).filter((g) => g.roundId === r.id);
    const board = Number.isInteger(raw.board) && (raw.board as number) > 0 ? (raw.board as number) : existing.reduce((m, g) => Math.max(m, g.board), 0) + 1;
    const result = RESULTS.includes(raw.result as GameResult) ? (raw.result as GameResult) : '*';
    const game: BroadcastPgnGame = {
      white,
      black,
      whiteTitle: null,
      blackTitle: null,
      whiteElo: null,
      blackElo: null,
      whiteFideId: null,
      blackFideId: null,
      whiteFed: null,
      blackFed: null,
      result,
      initialFen: new Game().fen,
      moves: [],
      clocks: [],
      board,
      round: null,
    };
    await this.writeGames(r, [game], { replace: false, keepUnchanged: false });
    return this.detail(viewer, r.eventId);
  }

  async setResult(viewer: string, gameId: string, result: unknown): Promise<EventDetail> {
    const g = await getBroadcastGame(this.db, gameId);
    if (!g) throw new WatchError(404, 'Game not found');
    this.requireManager(viewer, g.eventId);
    if (!RESULTS.includes(result as GameResult)) throw new WatchError(400, 'Choose a result', 'result');
    await updateGame(this.db, gameId, { result: result as GameResult });
    this.invalidate(g.eventId);
    return this.detail(viewer, g.eventId);
  }

  async removeGame(viewer: string, gameId: string): Promise<EventDetail> {
    const g = await getBroadcastGame(this.db, gameId);
    if (!g) throw new WatchError(404, 'Game not found');
    this.requireManager(viewer, g.eventId);
    await deleteGame(this.db, gameId);
    this.invalidate(g.eventId);
    return this.detail(viewer, g.eventId);
  }

  /** Applies a PGN file (pasted or fetched from the round's source) to a round. */
  async applyPgn(round: BroadcastRoundRow, pgn: string, opts: { replace: boolean }): Promise<PgnApplyResult> {
    const games = parseBroadcastPgn(pgn).slice(0, EVENT_LIMITS.gamesPerRound);
    return this.writeGames(round, games, { replace: opts.replace, keepUnchanged: true });
  }

  private async writeGames(round: BroadcastRoundRow, games: BroadcastPgnGame[], opts: { replace: boolean; keepUnchanged: boolean }): Promise<PgnApplyResult> {
    const eventId = round.eventId;
    const now = new Date(this.now());
    // Players: match by FIDE ID, then by name; add the ones the list is missing.
    let players = await listPlayers(this.db, eventId);
    const byFide = new Map(players.filter((p) => p.fideId).map((p) => [p.fideId!, p]));
    const byName = new Map(players.map((p) => [nameKey(p.name), p]));
    const missing = new Map<string, { name: string; title: ChessTitle | null; rating: number | null; federation: string | null; fideId: string | null }>();
    for (const g of games) {
      for (const side of [
        { name: g.white, title: g.whiteTitle, rating: g.whiteElo, federation: g.whiteFed, fideId: g.whiteFideId },
        { name: g.black, title: g.blackTitle, rating: g.blackElo, federation: g.blackFed, fideId: g.blackFideId },
      ]) {
        if (side.name === 'White' || side.name === 'Black' || side.name === '?') continue;
        if ((side.fideId && byFide.has(side.fideId)) || byName.has(nameKey(side.name))) continue;
        missing.set(side.fideId ?? nameKey(side.name), side);
      }
    }
    if (missing.size && players.length + missing.size <= EVENT_LIMITS.players) {
      await insertPlayers(this.db, [...missing.values()].map((m) => ({ eventId, ...m })));
      players = await listPlayers(this.db, eventId);
      for (const p of players) {
        if (p.fideId) byFide.set(p.fideId, p);
        byName.set(nameKey(p.name), p);
      }
    }
    const playerOf = (name: string, fideId: string | null) => (fideId ? byFide.get(fideId) : undefined) ?? byName.get(nameKey(name)) ?? null;

    const roundGames = (await listGameSummaries(this.db, eventId)).filter((g) => g.roundId === round.id);
    const existing = new Map(roundGames.map((g) => [g.board, g]));
    // Without a board number (live streams send one game at a time), a game keeps the board it had.
    const boardByPair = new Map(roundGames.map((g) => [`${nameKey(g.whiteName)}|${nameKey(g.blackName)}`, g.board]));
    const used = new Set<number>();
    let nextBoard = 1;
    const rows: NewBroadcastGame[] = [];
    let total = 0;
    let finished = 0;
    for (const g of games) {
      let board = g.board && !used.has(g.board) ? g.board : 0;
      if (!board) {
        const known = boardByPair.get(`${nameKey(g.white)}|${nameKey(g.black)}`);
        if (known && !used.has(known)) board = known;
      }
      if (!board) {
        // A new game: the next board nobody uses (when adding to a round, nor any game already in it).
        while (used.has(nextBoard) || (!opts.replace && existing.has(nextBoard))) nextBoard++;
        board = nextBoard;
      }
      used.add(board);
      let game: Game;
      try {
        game = Game.fromUciMoves(g.moves, g.initialFen);
      } catch {
        continue;
      }
      total++;
      if (g.result !== '*') finished++;
      const wp = playerOf(g.white, g.whiteFideId);
      const bp = playerOf(g.black, g.blackFideId);
      const lastMove = g.moves.length ? g.moves[g.moves.length - 1]! : null;
      const prev = existing.get(board);
      const same = prev && prev.ply === game.ply && prev.result === g.result && prev.lastMove === lastMove && prev.whiteName === g.white && prev.blackName === g.black;
      if (same && opts.keepUnchanged) continue;
      const clocks = lastClocks(g.clocks);
      rows.push({
        roundId: round.id,
        eventId,
        board,
        whiteName: g.white,
        blackName: g.black,
        whiteTitle: g.whiteTitle ?? wp?.title ?? null,
        blackTitle: g.blackTitle ?? bp?.title ?? null,
        whiteRating: g.whiteElo ?? wp?.rating ?? null,
        blackRating: g.blackElo ?? bp?.rating ?? null,
        whiteFed: g.whiteFed ?? wp?.federation ?? null,
        blackFed: g.blackFed ?? bp?.federation ?? null,
        whitePlayerId: wp?.id ?? null,
        blackPlayerId: bp?.id ?? null,
        result: g.result,
        initialFen: g.initialFen,
        moves: g.moves,
        clocks: g.clocks,
        fen: game.fen,
        ply: game.ply,
        lastMove,
        whiteClockMs: clocks.w,
        blackClockMs: clocks.b,
        // Clocks tick from when the position last changed.
        clockAt: prev && prev.ply === game.ply ? (prev.clockAt ?? now) : now,
        updatedAt: now,
      });
    }
    const ids = await upsertGames(this.db, rows);
    if (opts.replace && total > 0) await deleteGamesExcept(this.db, round.id, [...used]);
    if (ids.length || opts.replace) this.invalidate(eventId);
    if (ids.length) this.hooks.gamesChanged?.(ids);
    const finishedInRound = opts.replace ? finished === total : [...existing.values()].every((g) => g.result !== '*') && finished === total;
    return { games: total, changed: ids.length, allFinished: total > 0 && finishedInRound };
  }

  // News

  async addNews(viewer: string, eventId: string, raw: unknown): Promise<EventDetail> {
    this.requireManager(viewer, eventId);
    const input = cleanEventNews(raw);
    if ('error' in input) fail(input);
    await insertEventNews(this.db, { eventId, authorId: viewer, ...input.value });
    this.invalidate(eventId);
    return this.detail(viewer, eventId);
  }

  async removeNews(viewer: string, newsId: string): Promise<EventDetail> {
    const n = await getEventNews(this.db, newsId);
    if (!n) throw new WatchError(404, 'Post not found');
    this.requireManager(viewer, n.eventId);
    await deleteEventNews(this.db, newsId);
    this.invalidate(n.eventId);
    return this.detail(viewer, n.eventId);
  }

  // -------------------------------------------------------------------------
  // Applications to broadcast

  async apply(userId: string, raw: unknown): Promise<EventApplicationView> {
    const input = cleanEventApplication(raw);
    if ('error' in input) fail(input);
    const mine = await listEventApplications(this.db, { userId });
    if (mine.some((a) => a.status === 'pending')) throw new WatchError(409, 'You already have an application being reviewed');
    if ((await countEventApplicationsSince(this.db, userId, new Date(this.now() - 30 * 86_400_000))) >= EVENT_LIMITS.applicationsPer30d) {
      throw new WatchError(429, 'You have applied too often. Try again later.');
    }
    const v = input.value;
    const row = await insertEventApplication(this.db, { userId, ...v, startsAt: new Date(v.startsAt), endsAt: new Date(v.endsAt) });
    return appView((await getEventApplication(this.db, row.id))!);
  }

  async myApplications(userId: string): Promise<EventApplicationView[]> {
    return (await listEventApplications(this.db, { userId })).map(appView);
  }

  async applications(viewer: string, status?: string): Promise<EventApplicationView[]> {
    this.requireAdmin(viewer);
    return (await listEventApplications(this.db, { status: status && ['pending', 'approved', 'rejected'].includes(status) ? status : undefined })).map(appView);
  }

  /** Approving creates the event (unpublished) and makes the applicant its organiser. */
  async review(viewer: string, id: string, raw: { approve?: unknown; note?: unknown }): Promise<EventApplicationView> {
    this.requireAdmin(viewer);
    const a = await getEventApplication(this.db, id);
    if (!a) throw new WatchError(404, 'Application not found');
    if (a.status !== 'pending') throw new WatchError(409, 'This application was already reviewed');
    const approve = raw.approve === true;
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 500) || null : null;
    let eventId: string | null = null;
    if (approve) {
      const e = await insertEvent(this.db, {
        name: a.eventName,
        shortDescription: a.organization.slice(0, EVENT_LIMITS.short),
        description: a.description,
        location: a.location,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        website: a.website,
        createdBy: a.userId,
      });
      eventId = e.id;
      await addOrganizer(this.db, e.id, a.userId, viewer);
      this.organizers.set(e.id, new Set([a.userId]));
      this.listCache = null;
      this.hooks.notify(a.userId, 'Your event can be broadcast', `${a.eventName} is ready. Add players and rounds, then publish it.`, `/watch/manage/${e.id}`);
    } else {
      this.hooks.notify(a.userId, 'Broadcast application', note ? `Not approved: ${note}` : `Your application for ${a.eventName} was not approved.`, '/watch/apply');
    }
    await reviewEventApplication(this.db, id, { status: approve ? 'approved' : 'rejected', note, reviewedBy: viewer, eventId });
    await this.audit(viewer, approve ? 'broadcast.approve' : 'broadcast.reject', { id, name: a.eventName }, { eventId, applicant: a.username });
    return appView((await getEventApplication(this.db, id))!);
  }

  // -------------------------------------------------------------------------
  // Settings and Lichess import

  async settings(): Promise<WatchSettings> {
    if (!this.settingsCache) {
      const stored = await getAppSetting<Partial<WatchSettings>>(this.db, SETTINGS_KEY);
      this.settingsCache = { lichessImport: stored?.lichessImport ?? true };
    }
    return this.settingsCache;
  }

  async saveSettings(viewer: string, raw: { lichessImport?: unknown }): Promise<WatchSettings> {
    this.requireAdmin(viewer);
    const next = { ...(await this.settings()) };
    if (typeof raw.lichessImport === 'boolean') next.lichessImport = raw.lichessImport;
    await setAppSetting(this.db, SETTINGS_KEY, next);
    this.settingsCache = next;
    await this.audit(viewer, 'watch.settings', { id: SETTINGS_KEY, name: 'Watch settings' }, { ...next });
    return next;
  }

  /**
   * Creates or updates an event from a Lichess broadcast tournament and its
   * rounds. Returns rounds Lichess says are finished, for one last sync.
   */
  async importLichessTour(tour: LichessBroadcastTour, rounds: LichessBroadcastRound[]): Promise<BroadcastRoundRow[]> {
    let e = await findEventByExternal(this.db, 'lichess', tour.id);
    if (!e) {
      const v = lichessTourToEvent(tour, rounds);
      const created = await insertEvent(this.db, {
        ...v,
        startsAt: new Date(v.startsAt),
        endsAt: new Date(v.endsAt),
        published: true,
        source: 'lichess',
        externalId: tour.id,
        sourceUrl: tour.url ?? `${LICHESS_ORIGIN}/broadcast/-/${tour.id}`,
        logo: tour.image && /^https:\/\//.test(tour.image) ? tour.image : null,
      });
      e = (await getEvent(this.db, created.id))!;
    } else {
      const v = lichessTourToEvent(tour, rounds);
      if (v.endsAt !== e.endsAt.getTime() || v.startsAt !== e.startsAt.getTime()) await updateEvent(this.db, e.id, { startsAt: new Date(v.startsAt), endsAt: new Date(v.endsAt) });
    }
    const existing = new Map((await listRounds(this.db, e.id)).filter((r) => r.lichessRoundId).map((r) => [r.lichessRoundId!, r]));
    const finalSync: BroadcastRoundRow[] = [];
    for (const [i, lr] of rounds.slice(0, EVENT_LIMITS.rounds).entries()) {
      let r = existing.get(lr.id);
      const startsAt = lr.startsAt ? new Date(lr.startsAt) : null;
      if (!r) {
        r = await insertRound(this.db, { eventId: e.id, number: i + 1, name: lr.name.slice(0, 60) || `Round ${i + 1}`, startsAt, sourceKind: 'lichess', lichessRoundId: lr.id });
      } else if (r.name !== lr.name.slice(0, 60) || (r.startsAt?.getTime() ?? null) !== (startsAt?.getTime() ?? null)) {
        r = (await updateRound(this.db, r.id, { name: lr.name.slice(0, 60) || r.name, startsAt })) ?? r;
      }
      if (lr.finished && !r.sourceFinished) finalSync.push(r);
    }
    this.invalidate(e.id);
    return finalSync;
  }

  /** After a sync: remember when it ran, or why it failed; `finished` stops further polling. */
  async markSynced(round: BroadcastRoundRow, v: { error?: string | null; finished?: boolean }) {
    await updateRound(this.db, round.id, {
      lastSyncAt: new Date(this.now()),
      syncError: v.error ?? null,
      ...(v.finished ? { sourceFinished: true } : {}),
    });
    this.invalidate(round.eventId);
  }

  /** Lets a round marked done be synced again (its source is read until it succeeds). */
  async reopenSync(round: BroadcastRoundRow) {
    await updateRound(this.db, round.id, { sourceFinished: false });
    this.invalidate(round.eventId);
  }

  async roundsOf(eventId: string): Promise<BroadcastRoundRow[]> {
    return listRounds(this.db, eventId);
  }

  async eventOfLichessTour(tourId: string): Promise<string | null> {
    return (await findEventByExternal(this.db, 'lichess', tourId))?.id ?? null;
  }

  /** Fills in missing federations of the event's players and of a round's games (matched by FIDE id, then name). */
  async applyFederations(round: BroadcastRoundRow, incoming: { name: string; fideId: string | null; federation: string }[]) {
    const byFide = new Map(incoming.filter((p) => p.fideId).map((p) => [p.fideId!, p.federation]));
    const byName = new Map(incoming.map((p) => [nameKey(p.name), p.federation]));
    const fedOf = (name: string, fideId: string | null) => (fideId ? byFide.get(fideId) : undefined) ?? byName.get(nameKey(name)) ?? null;
    let changed = false;
    const players = await listPlayers(this.db, round.eventId);
    const playerFed = new Map<string, string>();
    for (const p of players) {
      const f = p.federation ?? fedOf(p.name, p.fideId);
      if (f) playerFed.set(p.id, f);
      if (!p.federation && f) {
        await updatePlayer(this.db, p.id, { federation: f });
        changed = true;
      }
    }
    for (const g of (await listGameSummaries(this.db, round.eventId)).filter((x) => x.roundId === round.id)) {
      const w = g.whiteFed ?? (g.whitePlayerId ? playerFed.get(g.whitePlayerId) : undefined) ?? fedOf(g.whiteName, null);
      const b = g.blackFed ?? (g.blackPlayerId ? playerFed.get(g.blackPlayerId) : undefined) ?? fedOf(g.blackName, null);
      if ((w && !g.whiteFed) || (b && !g.blackFed)) {
        await updateGameFeds(this.db, g.id, { whiteFed: w ?? null, blackFed: b ?? null });
        changed = true;
      }
    }
    if (changed) this.invalidate(round.eventId);
  }

  /** The Lichess tournament an imported event came from, if any. */
  async lichessTourOf(eventId: string): Promise<string | null> {
    const b = this.built.get(eventId)?.value;
    const row = b ? b.row : await getEvent(this.db, eventId);
    return row && row.source === 'lichess' ? row.externalId : null;
  }

  async eventEndsAt(eventId: string): Promise<number | null> {
    const b = this.built.get(eventId)?.value;
    if (b) return b.row.endsAt.getTime();
    return (await getEvent(this.db, eventId))?.endsAt.getTime() ?? null;
  }
}
