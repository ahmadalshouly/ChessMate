import {
  PROTOCOL_VERSION,
  isChallengeId,
  resolveChallengeColor,
  decodeClient,
  encode,
  positionKey,
  START_FEN,
  timeCategory,
  type Challenge,
  type ChallengeEndReason,
  type ClientMessage,
  type Color,
  type ColorChoice,
  type ErrorCode,
  type GameAnalyzer,
  type GameTournamentRef,
  type LobbyState,
  type LiveGameEntry,
  type Presence,
  type Rating,
  type RatingCategory,
  type ServerMessage,
  canSeekRated,
  sanitizeRatingRange,
} from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ChallengeBook, type ChallengeError, type ChallengeLimits } from './challenges';
import { handleAdmin } from './admin/tokenApi';
import { CLOSE_ACCOUNT_CLOSED, adminRoutes, type AdminBridge, type AdminService } from './admin';
import { titleRoutes } from './titles';
import { TournamentService, tournamentRoutes, type TournamentBridge } from './tournaments';
import { CoachService } from './coach/coachService';
import { createCoachHttpHandler } from './coach/http';
import type { AnalysisService } from './engine/analysisService';
import { GameRoom, type MoveError } from './gameRoom';
import type { HttpRoute } from './auth/http';
import type { AuthService } from './auth/service';
import { GuestSessions } from './guestSessions';
import { Matchmaker, type MatchOptions } from './matchmaker';
import { OpenGames } from './openGames';
import { Leaderboards, MemoryLeaderboardSource } from './leaderboard';
import type { GamePersistence } from './persistence';
import { MemoryPlayerStore, authenticate, devViewerId, isGuest, playerInfo, type Player, type PlayerStore } from './players';
import { handlePublicApi, type PublicApiDeps, type ServerStats } from './publicApi';
import { RatingService } from './ratingService';
import { Moderation } from './moderation';
import {
  ConnectionLimiter,
  DEFAULT_RATE_LIMITS,
  FairPlayService,
  IpLimiter,
  analyzerFromEnv,
  createAdminHandler,
  validateClientMessage,
  type FairPlayOptions,
  type LimitKind,
  type RateLimitConfig,
} from './fairplay';
import { ExpoPushSender, MemoryNotificationStore, NotificationService, handleNotificationsHttp, yourTurn, type HttpAuth } from './notifications';
import { socialRoutes, type ResolveUser } from './social/http';
import { isAccountId, type SocialService } from './social/service';

export interface ServerOptions {
  port: number;
  store?: PlayerStore;
  /** Saves games, moves and rating changes; omitted means in-memory only. */
  persistence?: GamePersistence;
  ratings?: RatingService;
  /** Account auth; when set, WebSocket hello accepts its access tokens. */
  auth?: AuthService;
  /** Extra HTTP handlers (e.g. /api/auth), tried in order before the 404. */
  http?: HttpRoute[];
  /** How long a disconnected player may be away before forfeiting. */
  reconnectGraceMs?: number;
  matchIntervalMs?: number;
  challengeLimits?: ChallengeLimits;
  match?: Partial<MatchOptions>;
  now?: () => number;
  /** Leaderboard data; defaults to ranking players in the in-memory store. */
  leaderboards?: Leaderboards;
  /** Maps an HTTP bearer token to a user id (accounts plug in here). */
  viewerFor?: PublicApiDeps['viewerFor'];
  moderation?: Moderation;
  /** Bearer token for the /admin moderation API; disabled when unset. */
  adminToken?: string;
  /** Fair-play settings. Defaults read STOCKFISH_PATH and FAIRPLAY_ADMIN_TOKEN from the environment. */
  fairPlay?: FairPlayOptions & { adminToken?: string };
  rateLimits?: Partial<RateLimitConfig>;
  /** AI coach. Defaults to the rule-based (offline) coach. */
  coach?: CoachService;
  /** Engine analysis service, when available, for coach reviews from raw moves. */
  analyzer?: GameAnalyzer;
  /** Notification service; defaults to in-memory storage with Expo push. */
  notifications?: NotificationService;
  /** Maps an HTTP bearer token to a user id. Defaults to dev tokens ("dev:<id>:<name>") outside production. */
  httpAuth?: HttpAuth;
  /** Engine analysis. Without it, analysis requests get `engine_unavailable`. */
  analysis?: AnalysisService | null;
  /** Friends, follows, blocks, presence and the activity feed. Off when absent. */
  social?: SocialService;
  /** Bearer token to account id for the social API. Defaults to dev tokens outside production. */
  resolveUser?: ResolveUser;
  /** Staff console (/api/admin): roles, account closure, audit log. Needs `auth` and the database. */
  admin?: AdminService;
  /** Tournaments; in memory when left out. Share the same instance with AdminService. */
  tournaments?: TournamentService;
}

/** How often a seeking player hears about their widening rating window. */
const SEEK_STATUS_INTERVAL_MS = 1_000;

interface Connection {
  ws: WebSocket;
  player: Player | null;
  limiter: ConnectionLimiter;
  /** Games this socket is spectating. */
  watching: Set<string>;
}

/** Close code sent to an account closed for fair-play violations. */
export const CLOSE_FAIR_PLAY_BAN = 4010;
/** Close code for clients that keep ignoring rate limits. */
export const CLOSE_RATE_LIMITED = 4008;

const LIMIT_KIND: Partial<Record<ClientMessage['t'], LimitKind>> = { move: 'moves', seek: 'seeks', cancelSeek: 'seeks' };

/** Accepts "dev:<id>:<name>" bearer tokens outside production. */
export const devResolveUser = (token: string): string | null => {
  if (process.env.NODE_ENV === 'production') return null;
  return /^dev:([\w-]{1,64}):[\w .-]{1,24}$/.exec(token)?.[1] ?? null;
};

/**
 * Realtime game server: authentication handshake, matchmaking, and
 * authoritative game rooms. Single-process for now; to scale horizontally,
 * pin each game to one node and route sockets by game id (e.g. via Redis).
 */
export class ChessServer {
  readonly http: HttpServer;
  readonly wss: WebSocketServer;
  private readonly store: PlayerStore;
  readonly ratings: RatingService;
  private readonly matchmaker: Matchmaker;
  private readonly challenges: ChallengeBook;
  private readonly openGames = new OpenGames();
  private readonly guests = new GuestSessions();
  private readonly lobbySubs = new Set<WebSocket>();
  private lobbyDirty = false;
  private lastSeekStatus = 0;
  /** Finished games where one side has asked for a rematch. */
  private readonly rematchOffers = new Map<string, Color>();
  /** Server time at which each absent player forfeits. */
  private readonly abandonAt = new Map<string, number>();
  private readonly rooms = new Map<string, GameRoom>();
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private readonly spectators = new Map<string, Set<WebSocket>>();
  private readonly social: SocialService | undefined;
  private readonly now: () => number;
  private readonly matchTimer: NodeJS.Timeout;
  readonly moderation: Moderation;
  readonly fairPlay: FairPlayService;
  private readonly limits: RateLimitConfig;
  private readonly ipLimiter: IpLimiter;
  readonly notifications: NotificationService;
  readonly tournaments: TournamentService;

  constructor(private readonly opts: ServerOptions) {
    this.store = opts.store ?? new MemoryPlayerStore();
    this.ratings = opts.ratings ?? new RatingService();
    this.now = opts.now ?? Date.now;
    this.matchmaker = new Matchmaker(opts.match);
    this.challenges = new ChallengeBook(opts.challengeLimits);
    const store = this.store;
    const api: PublicApiDeps = {
      leaderboards: opts.leaderboards ?? new Leaderboards(new MemoryLeaderboardSource(() => store.all?.() ?? [])),
      stats: () => this.stats(),
      viewerFor: opts.viewerFor ?? devViewerId,
    };
    this.moderation = opts.moderation ?? new Moderation(undefined, this.now);
    this.limits = { ...DEFAULT_RATE_LIMITS, ...opts.rateLimits };
    this.ipLimiter = new IpLimiter(this.limits.connectionsPerIp);
    const fp = opts.fairPlay ?? {};
    this.fairPlay = new FairPlayService(this.store, {
      ...fp,
      analyzer: fp.analyzer === undefined ? analyzerFromEnv() : fp.analyzer,
      now: fp.now ?? this.now,
      refund: fp.refund ?? ((r) => void this.adjustRating(r.playerId, r.category, r.points, `refund:${r.gameId}`)),
    });
    this.fairPlay.onBan = (id) => {
      this.kickBanned(id);
      opts.admin?.onFairPlayBan(id);
    };
    const admin = createAdminHandler(this.fairPlay, fp.adminToken ?? process.env.FAIRPLAY_ADMIN_TOKEN);
    const coachHttp = createCoachHttpHandler({
      service: opts.coach ?? new CoachService(),
      analyzer: opts.analyzer,
      authorize: (token) => authenticate(token, this.store, this.opts.auth && ((t) => this.opts.auth!.verifyAccessToken(t)))?.id ?? null,
      now: this.now,
    });
    this.notifications =
      opts.notifications ??
      new NotificationService({
        store: new MemoryNotificationStore(),
        push: new ExpoPushSender({ accessToken: process.env.EXPO_ACCESS_TOKEN, log: console.warn }),
        log: console.warn,
      });
    this.notifications.attach({
      deliver: (userId, notification, unread) => {
        for (const ws of this.sockets.get(userId) ?? []) this.send(ws, { t: 'notification', notification, unread });
      },
      isOnline: (userId) => (this.sockets.get(userId)?.size ?? 0) > 0,
    });
    const accountAuth: HttpAuth | null = opts.auth ? (t) => opts.auth!.verifyAccessToken(t)?.userId ?? null : null;
    const httpAuth: HttpAuth = opts.httpAuth ?? ((t) => accountAuth?.(t) ?? devHttpAuth(t));
    this.social = opts.social;
    const routes = [...(opts.http ?? [])];
    this.tournaments = opts.tournaments ?? new TournamentService({ now: this.now });
    this.tournaments.attach(this.tournamentBridge());
    routes.push(
      tournamentRoutes(this.tournaments, (token) => {
        const id = httpAuth(token);
        if (!id) return null;
        return { userId: id, username: this.store.get(id)?.name ?? opts.auth?.verifyAccessToken(token)?.username ?? id };
      }),
    );
    if (opts.admin && opts.auth) {
      opts.admin.attach(this.adminBridge(fp.analyzer === undefined ? !!process.env.STOCKFISH_PATH : !!fp.analyzer));
      routes.push(adminRoutes(opts.admin, opts.auth));
      routes.push(titleRoutes(opts.admin.titles, opts.auth));
    }
    if (this.social) {
      routes.push(socialRoutes(this.social, opts.resolveUser ?? devResolveUser));
      this.social.attach(
        { presence: (id) => this.presenceOf(id), liveGames: (ids) => this.liveGamesOf(ids) },
        (ids, event) => {
          for (const id of ids) for (const ws of this.sockets.get(id) ?? []) this.send(ws, { t: 'social', event });
        },
      );
    }
    this.http = createServer(async (req, res) => {
      if (req.url?.startsWith('/coach/')) {
        await coachHttp(req, res);
        return;
      }
      if (await admin(req, res)) return;
      if (handleAdmin(req, res, this.moderation, opts.adminToken)) return;
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, games: this.rooms.size, seeking: this.matchmaker.size, openGames: this.openGames.size }));
        return;
      }
      if (handlePublicApi(req, res, api)) return;
      const url = new URL(req.url ?? '/', 'http://localhost');
      for (const route of routes) {
        try {
          if (await route(req, res, url)) return;
        } catch (e) {
          console.error('[http]', e);
          if (!res.headersSent) res.writeHead(500);
          res.end();
          return;
        }
      }
      try {
        if (await handleNotificationsHttp(req, res, { service: this.notifications, auth: httpAuth, now: this.now, dev: process.env.NODE_ENV !== 'production' })) return;
      } catch {
        if (!res.headersSent) res.writeHead(500).end();
        return;
      }
      res.writeHead(404).end();
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws, req) => {
      if (!this.ipLimiter.allow(clientIp(req), this.now())) return ws.close(CLOSE_RATE_LIMITED, 'too many connections');
      this.onConnection(ws);
    });
    this.matchTimer = setInterval(() => this.tick(), opts.matchIntervalMs ?? 500);
  }

  listen(): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(this.opts.port, () => {
        const addr = this.http.address();
        resolve(typeof addr === 'object' && addr ? addr.port : this.opts.port);
      });
    });
  }

  async close(): Promise<void> {
    clearInterval(this.matchTimer);
    await this.fairPlay.close();
    this.opts.analysis?.close();
    for (const t of [...this.timers.values(), ...this.graceTimers.values()]) clearTimeout(t);
    for (const c of this.wss.clients) c.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.http.close(() => r()));
    await this.opts.persistence?.flush();
    await this.tournaments.flush();
  }

  // ---- connection handling ----

  private onConnection(ws: WebSocket) {
    const conn: Connection = { ws, player: null, limiter: new ConnectionLimiter(this.limits, this.now()), watching: new Set() };
    const helloTimeout = setTimeout(() => !conn.player && ws.close(4001, 'hello timeout'), 10_000);
    ws.on('message', (data) => {
      const msg = decodeClient(String(data));
      const limit = conn.limiter.check(msg ? (LIMIT_KIND[msg.t] ?? null) : null, this.now());
      if (limit === 'disconnect') return ws.close(CLOSE_RATE_LIMITED, 'rate limited');
      if (limit === 'limited') return this.send(ws, err('rate_limited', 'Slow down'));
      if (!msg) return this.send(ws, err('bad_request', 'Malformed message'));
      const invalid = validateClientMessage(msg);
      if (invalid) return this.send(ws, err('bad_request', invalid));
      try {
        this.onMessage(conn, msg);
      } catch (e) {
        this.send(ws, err('bad_request', e instanceof Error ? e.message : 'Error'));
      }
    });
    ws.on('close', () => {
      clearTimeout(helloTimeout);
      for (const id of conn.watching) this.unwatch(ws, id);
      if (conn.player) this.onDisconnect(conn.player.id, ws);
    });
  }

  private onMessage(conn: Connection, msg: ClientMessage) {
    const { ws } = conn;
    if (msg.t === 'hello') {
      if (msg.v !== PROTOCOL_VERSION) return this.send(ws, err('bad_request', 'Unsupported protocol version'));
      if (conn.player) return this.send(ws, err('bad_request', 'Already said hello'));
      const token = String(msg.token ?? '');
      const resumed = this.guests.resolve(token);
      const player =
        resumed === undefined
          ? authenticate(token, this.store, this.opts.auth && ((t) => this.opts.auth!.verifyAccessToken(t)))
          : resumed
            ? this.store.get(resumed)
            : undefined;
      if (!player) return ws.close(4003, 'unauthorized');
      if (this.fairPlay.isBanned(player.id)) return ws.close(CLOSE_FAIR_PLAY_BAN, 'account closed for fair play violation');
      if (this.opts.admin?.isClosed(player.id)) return ws.close(CLOSE_ACCOUNT_CLOSED, 'account closed');
      conn.player = player;
      const set = this.sockets.get(player.id) ?? new Set();
      const wasOnline = set.size > 0;
      const cameOnline = !wasOnline;
      set.add(ws);
      this.sockets.set(player.id, set);
      if (cameOnline) this.pushPresence(player.id);
      this.cancelGrace(player.id);
      if (!wasOnline) this.markLobbyDirty();
      this.send(ws, {
        t: 'welcome',
        v: PROTOCOL_VERSION,
        player: playerInfo(player, this.ratings.get(player.id, 'blitz', this.now())),
        resumeToken: isGuest(player) ? this.guests.issue(player.id) : undefined,
      });
      this.resume(ws, player.id, !wasOnline);
      const now = this.now();
      for (const c of [...this.challenges.incoming(player.id), ...this.challenges.outgoing(player.id)]) {
        if (c.expiresAt > now) this.send(ws, { t: 'challenge', challenge: c });
      }
      return;
    }
    const player = conn.player;
    if (!player) return this.send(ws, err('unauthorized', 'Say hello first'));
    const now = this.now();

    switch (msg.t) {
      case 'ping':
        return this.send(ws, { t: 'pong', id: msg.id, serverNow: now });
      case 'seek': {
        if (this.activeRoomOf(player.id)) return this.send(ws, err('bad_request', 'Already in a game'));
        const tc = msg.timeControl;
        if (!validTimeControl(tc)) return this.send(ws, err('bad_request', 'Invalid time control'));
        const r = this.ratings.forTimeControl(player.id, tc, now);
        this.matchmaker.add({
          playerId: player.id,
          rating: r.rating,
          rd: r.rd,
          timeControl: tc,
          rated: !!msg.rated && canSeekRated(isGuest(player)),
          createdAt: now,
          ratingRange: sanitizeRatingRange(msg.ratingRange, r.rating) ?? undefined,
          range: validWindow(msg.range),
        });
        this.markLobbyDirty();
        this.toPlayer(player.id, { t: 'seeking', timeControl: tc });
        this.sendSeekStatus(player.id, now);
        return;
      }
      case 'cancelSeek':
        if (this.matchmaker.remove(player.id)) this.markLobbyDirty();
        return this.toPlayer(player.id, { t: 'seekCancelled' });
      case 'lobbySub':
        this.lobbySubs.add(ws);
        return this.send(ws, { t: 'lobby', lobby: this.lobbyState() });
      case 'lobbyUnsub':
        this.lobbySubs.delete(ws);
        return;
      case 'createOpenGame': {
        if (this.activeRoomOf(player.id)) return this.send(ws, err('bad_request', 'Already in a game'));
        const tc = msg.timeControl;
        if (!validTimeControl(tc)) return this.send(ws, err('bad_request', 'Invalid time control'));
        const color: ColorChoice = msg.color === 'w' || msg.color === 'b' ? msg.color : 'random';
        const rated = !!msg.rated && canSeekRated(isGuest(player));
        const game = this.openGames.create(playerInfo(player, this.ratings.forTimeControl(player.id, tc, now)), tc, rated, color, now, validWindow(msg.range));
        this.markLobbyDirty();
        return this.toPlayer(player.id, { t: 'openGameCreated', game });
      }
      case 'cancelOpenGame':
        if (this.openGames.removeBy(player.id)) this.markLobbyDirty();
        return this.toPlayer(player.id, { t: 'openGameCancelled' });
      case 'joinOpenGame': {
        const open = this.openGames.get(String(msg.id));
        if (!open) return this.send(ws, err('not_found', 'That game is no longer open'));
        if (open.by.id === player.id) return this.send(ws, err('bad_request', 'You created this game'));
        if (this.activeRoomOf(player.id)) return this.send(ws, err('bad_request', 'Already in a game'));
        if (open.rated && isGuest(player)) return this.send(ws, err('unauthorized', 'Sign in to play rated games'));
        if (!OpenGames.accepts(open, this.ratings.forTimeControl(player.id, open.timeControl, now).rating))
          return this.send(ws, err('bad_request', 'Your rating is outside the range for this game'));
        const creator = this.store.get(open.by.id);
        if (!creator || !this.sockets.has(creator.id) || this.activeRoomOf(creator.id)) {
          this.openGames.remove(open.id);
          this.markLobbyDirty();
          return this.send(ws, err('not_found', 'That game is no longer open'));
        }
        const creatorWhite = open.color === 'w' || (open.color === 'random' && Math.random() < 0.5);
        const [white, black] = creatorWhite ? [creator, player] : [player, creator];
        this.createGame(white, black, open.timeControl, open.rated, now);
        return;
      }
      case 'rematch':
        return this.onRematch(ws, player, String(msg.gameId), now);
      case 'declineRematch': {
        const room = this.rooms.get(String(msg.gameId));
        if (!room || !room.colorOf(player.id) || !this.rematchOffers.has(room.id)) return;
        this.rematchOffers.delete(room.id);
        return this.broadcast(room, { t: 'rematchDeclined', gameId: room.id });
      }
      case 'join': {
        const room = this.rooms.get(msg.gameId);
        if (!room) return this.send(ws, err('not_found', 'No such game'));
        const color = room.colorOf(player.id);
        if (color) {
          this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
          return this.send(ws, { t: 'chatHistory', gameId: room.id, lines: this.moderation.chatLog(room.id) });
        }
        return this.send(ws, { t: 'gameState', game: room.snapshot(now) });
      }
      case 'move': {
        const room = this.rooms.get(msg.gameId);
        if (!room) return this.send(ws, err('not_found', 'No such game'));
        const res = room.move(player.id, msg.uci, msg.ply, now);
        if (typeof res === 'string') {
          // Re-sync the client so its board matches the server.
          this.send(ws, err(res as MoveError, moveErrorText(res)));
          this.send(ws, { t: 'gameState', game: room.snapshot(now) });
        }
        return;
      }
      case 'watch': {
        const room = this.rooms.get(String(msg.gameId));
        if (!room) return this.send(ws, err('not_found', 'No such game'));
        const color = room.colorOf(player.id);
        if (color) return this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
        const allowed = this.social ? this.social.canWatch(player.id, room.white.id, room.black.id) : Promise.resolve(true);
        return void allowed.then((ok) => {
          if (!ok) return this.send(ws, err('forbidden', 'You cannot watch this game'));
          if (ws.readyState !== ws.OPEN) return;
          const set = this.spectators.get(room.id) ?? new Set();
          set.add(ws);
          this.spectators.set(room.id, set);
          conn.watching.add(room.id);
          this.send(ws, { t: 'gameState', game: room.snapshot(this.now()) });
          this.broadcast(room, { t: 'watching', gameId: room.id, spectators: set.size });
        });
      }
      case 'unwatch':
        conn.watching.delete(String(msg.gameId));
        return this.unwatch(ws, String(msg.gameId));
      case 'resign':
        return void this.withRoom(ws, msg.gameId, (r) => r.resign(player.id, now));
      case 'abort':
        return void this.withRoom(ws, msg.gameId, (r) => r.abort(player.id, now));
      case 'offerDraw':
        return void this.withRoom(ws, msg.gameId, (r) => r.offerDraw(player.id));
      case 'acceptDraw':
        return void this.withRoom(ws, msg.gameId, (r) => r.acceptDraw(player.id, now));
      case 'declineDraw':
        return void this.withRoom(ws, msg.gameId, (r) => {
          const ok = r.declineDraw(player.id);
          if (ok) this.broadcast(r, { t: 'drawDeclined', gameId: r.id });
          return ok;
        });
      case 'challengeCreate':
      case 'challengeGet':
      case 'challengeAccept':
      case 'challengeDecline':
      case 'challengeCancel':
        return this.onChallengeMessage(player, ws, msg, now);
      case 'chat': {
        const room = this.rooms.get(msg.gameId);
        if (!room || !room.colorOf(player.id)) return this.send(ws, err('not_found', 'No such game'));
        const res = this.moderation.chat(player, room.id, msg);
        if (!res.ok) return this.send(ws, err(res.code, res.message));
        return this.broadcast(room, { t: 'chat', line: res.line });
      }
      case 'report': {
        const target = typeof msg.playerId === 'string' ? this.store.get(msg.playerId) : undefined;
        if (!target) return this.send(ws, err('not_found', 'No such player'));
        const room = msg.gameId ? this.rooms.get(msg.gameId) : undefined;
        const inGame = room && room.colorOf(player.id) ? room : undefined;
        const res = this.moderation.report(player, target, {
          gameId: inGame?.id ?? null,
          reason: msg.reason,
          note: msg.note,
          moves: inGame ? inGame.snapshot(now).moves : [],
        });
        if (!res.ok) return this.send(ws, err(res.code, res.message));
        return this.send(ws, { t: 'reported', reportId: res.report.id });
      }
      case 'analyze':
      case 'analyzeStop':
      case 'review':
        return this.onAnalysisMessage(player, ws, msg);
      case 'prepareReview': {
        // Only for games played off the server; nothing is sent back, and Review is still locked during live games.
        if (!Array.isArray(msg.moves) || !msg.moves.every((m) => typeof m === 'string')) return;
        if (this.activeRoomOf(player.id)) return;
        void this.opts.analysis?.precompute({ moves: msg.moves, initialFen: typeof msg.initialFen === 'string' ? msg.initialFen : START_FEN });
        return;
      }
      default:
        return this.send(ws, err('bad_request', 'Unknown message'));
    }
  }

  // ---- engine analysis ----

  /**
   * Engine help is refused while the player has a live game, and for any
   * position that is currently on the board in a live game (so a second
   * account cannot be used to look up moves).
   */
  private onAnalysisMessage(player: Player, ws: WebSocket, msg: Extract<ClientMessage, { t: 'analyze' | 'analyzeStop' | 'review' }>) {
    const analysis = this.opts.analysis;
    if (msg.t === 'analyzeStop') return analysis?.stop(player.id, msg.id);
    const id = Number(msg.id);
    if (!analysis) return this.send(ws, { ...err('engine_unavailable', 'Engine analysis is not running on this server'), id });
    const locked = () => this.send(ws, { ...err('engine_locked', 'Engine analysis is disabled during live games'), id });
    if (this.activeRoomOf(player.id)) return locked();
    const send = (m: ServerMessage) => this.send(ws, m);

    if (msg.t === 'analyze') {
      if (typeof msg.fen !== 'string' || msg.fen.length > 120) return this.send(ws, { ...err('bad_request', 'Invalid position'), id });
      if (this.isLivePosition(msg.fen)) return locked();
      void analysis.analyze(player.id, { id, fen: msg.fen, multipv: Number(msg.multipv) || 1, depth: Number(msg.depth) || undefined }, send);
      return;
    }

    let moves: string[];
    let initialFen: string;
    if (msg.gameId) {
      const room = this.rooms.get(String(msg.gameId));
      if (room && !room.outcome) return locked();
      moves = room ? room.game.uciHistory() : msg.moves;
      initialFen = room ? room.initialFen : (msg.initialFen ?? START_FEN);
    } else {
      moves = msg.moves;
      initialFen = msg.initialFen ?? START_FEN;
    }
    if (!Array.isArray(moves) || !moves.every((m) => typeof m === 'string') || typeof initialFen !== 'string') {
      return this.send(ws, { ...err('bad_request', 'Invalid move list'), id });
    }
    void analysis.review(player.id, { id, moves, initialFen, gameId: msg.gameId ? String(msg.gameId) : undefined }, send);
  }

  private isLivePosition(fen: string): boolean {
    const key = positionKey(fen);
    for (const r of this.rooms.values()) if (!r.outcome && positionKey(r.game.fen) === key) return true;
    return false;
  }

  private withRoom(ws: WebSocket, gameId: string, fn: (r: GameRoom) => boolean) {
    const room = this.rooms.get(gameId);
    if (!room) return this.send(ws, err('not_found', 'No such game'));
    if (!fn(room)) this.send(ws, err('bad_request', 'Action not allowed now'));
  }

  private onDisconnect(playerId: string, ws: WebSocket) {
    this.lobbySubs.delete(ws);
    const set = this.sockets.get(playerId);
    set?.delete(ws);
    if (set && set.size > 0) return;
    this.sockets.delete(playerId);
    this.pushPresence(playerId);
    this.matchmaker.remove(playerId);
    this.opts.analysis?.cancel(playerId);
    this.openGames.removeBy(playerId);
    this.markLobbyDirty();
    // A pending rematch cannot be accepted by someone who left.
    for (const [gameId] of this.rematchOffers) {
      const room = this.rooms.get(gameId);
      if (room?.colorOf(playerId)) {
        this.rematchOffers.delete(gameId);
        this.broadcast(room, { t: 'rematchDeclined', gameId }, playerId);
      }
    }
    const room = this.activeRoomOf(playerId);
    if (!room) return;
    const grace = this.opts.reconnectGraceMs ?? 60_000;
    const abandonAt = this.now() + grace;
    this.abandonAt.set(playerId, abandonAt);
    this.broadcast(room, { t: 'opponentConnection', gameId: room.id, connected: false, abandonAt }, playerId);
    this.graceTimers.set(
      playerId,
      setTimeout(() => {
        this.graceTimers.delete(playerId);
        this.abandonAt.delete(playerId);
        if (!this.sockets.has(playerId)) room.abandon(playerId, this.now());
      }, grace),
    );
  }

  /** Moves a rating without counting a game (refunds, staff corrections), in memory and in the database. */
  adjustRating(userId: string, category: RatingCategory, delta: number, sourceId: string) {
    const res = this.ratings.adjust(userId, category, delta, sourceId, this.now());
    this.opts.persistence?.ratingAdjusted?.(userId, category, res.after);
    return res;
  }

  /** What the tournament service uses to seat players and reach them. */
  private tournamentBridge(): TournamentBridge {
    return {
      startGame: (ref, tc, rated, whiteId, blackId) => {
        const white = this.store.get(whiteId);
        const black = this.store.get(blackId);
        if (!white || !black) return null;
        const room = this.createGame(white, black, tc, rated, this.now(), ref);
        const p = (i: GameRoom['white']) => ({ id: i.id, username: i.name, rating: i.rating });
        return { gameId: room.id, white: p(room.white), black: p(room.black) };
      },
      isOnline: (id) => this.sockets.has(id),
      busy: (id) => !!this.activeRoomOf(id),
      rating: (id, tc) => this.ratings.forTimeControl(id, tc, this.now()).rating,
      canPlay: (id) => !this.fairPlay.isBanned(id) && !this.opts.admin?.isClosed(id),
      terminate: (gameId) => void this.rooms.get(gameId)?.terminate(this.now()),
      notify: (userId, n) => void this.notifications.notify(userId, n),
    };
  }

  /** What the staff console reads and controls on the live server. */
  private adminBridge(analysisEnabled: boolean): AdminBridge {
    return {
      moderation: this.moderation,
      fairPlay: this.fairPlay,
      ratings: this.ratings,
      notifications: this.notifications,
      analysisEnabled,
      live: () => {
        const s = this.stats();
        return { playersOnline: s.playersOnline, gamesInProgress: s.gamesInProgress, playersSeeking: s.playersSeeking };
      },
      isOnline: (id) => this.sockets.has(id),
      liveGameOf: (id) => this.activeRoomOf(id)?.id ?? null,
      disconnect: (id, code, reason) => {
        this.matchmaker.remove(id);
        if (this.openGames.removeBy(id)) this.markLobbyDirty();
        this.activeRoomOf(id)?.resign(id, this.now());
        for (const ws of this.sockets.get(id) ?? []) ws.close(code, reason);
      },
      adjustRating: (id, category, delta, sourceId) => this.adjustRating(id, category, delta, sourceId),
      room: (id) => this.rooms.get(id),
      spectators: (id) => this.spectators.get(id)?.size ?? 0,
      terminate: (id) => this.rooms.get(id)?.terminate(this.now()) ?? false,
    };
  }

  /** Disconnects a banned account and forfeits its live game. */
  private kickBanned(playerId: string) {
    this.matchmaker.remove(playerId);
    this.activeRoomOf(playerId)?.resign(playerId, this.now());
    for (const ws of this.sockets.get(playerId) ?? []) ws.close(CLOSE_FAIR_PLAY_BAN, 'account closed for fair play violation');
  }

  private cancelGrace(playerId: string) {
    const t = this.graceTimers.get(playerId);
    if (t) clearTimeout(t);
    this.graceTimers.delete(playerId);
    this.abandonAt.delete(playerId);
  }

  /** Puts a (re)connecting socket back into its game, including the opponent's connection status. */
  private resume(ws: WebSocket, playerId: string, cameBack: boolean) {
    const now = this.now();
    const room = this.activeRoomOf(playerId);
    if (room) {
      const color = room.colorOf(playerId)!;
      this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
      this.send(ws, { t: 'chatHistory', gameId: room.id, lines: this.moderation.chatLog(room.id) });
      const oppId = color === 'w' ? room.black.id : room.white.id;
      if (!this.sockets.has(oppId)) {
        this.send(ws, { t: 'opponentConnection', gameId: room.id, connected: false, abandonAt: this.abandonAt.get(oppId) });
      }
      if (cameBack) this.broadcast(room, { t: 'opponentConnection', gameId: room.id, connected: true }, playerId);
      return;
    }
    const seek = this.matchmaker.get(playerId);
    if (seek) this.send(ws, { t: 'seeking', timeControl: seek.timeControl });
  }

  private onRematch(ws: WebSocket, player: Player, gameId: string, now: number) {
    const room = this.rooms.get(gameId);
    const color = room?.colorOf(player.id);
    if (!room || !color) return this.send(ws, err('not_found', 'No such game'));
    if (!room.outcome) return this.send(ws, err('bad_request', 'Game still in progress'));
    if (room.tournament) return this.send(ws, err('bad_request', 'No rematches in tournaments'));
    const oppId = color === 'w' ? room.black.id : room.white.id;
    if (!this.sockets.has(oppId)) return this.send(ws, err('bad_request', 'Your opponent has left'));
    if (this.activeRoomOf(player.id) || this.activeRoomOf(oppId)) return this.send(ws, err('bad_request', 'Already in a game'));
    const offered = this.rematchOffers.get(room.id);
    if (offered === color) return;
    if (offered && offered !== color) {
      this.rematchOffers.delete(room.id);
      const white = this.store.get(room.black.id);
      const black = this.store.get(room.white.id);
      if (!white || !black) return this.send(ws, err('not_found', 'Player not found'));
      this.createGame(white, black, room.timeControl, room.rated, now);
      return;
    }
    this.rematchOffers.set(room.id, color);
    this.broadcast(room, { t: 'rematchOffered', gameId: room.id, by: color });
  }

  // ---- lobby ----

  private lobbyState(): LobbyState {
    let playing = 0;
    for (const r of this.rooms.values()) if (!r.outcome) playing += 2;
    return { online: this.sockets.size, playing, pools: this.matchmaker.stats(), openGames: this.openGames.list() };
  }

  private markLobbyDirty() {
    this.lobbyDirty = true;
  }

  private flushLobby() {
    if (!this.lobbyDirty) return;
    this.lobbyDirty = false;
    if (this.lobbySubs.size === 0) return;
    const msg: ServerMessage = { t: 'lobby', lobby: this.lobbyState() };
    for (const ws of this.lobbySubs) this.send(ws, msg);
  }

  private sendSeekStatus(playerId: string, now: number) {
    const seek = this.matchmaker.get(playerId);
    if (!seek) return;
    const gap = this.matchmaker.allowedGap(seek, now);
    this.toPlayer(playerId, {
      t: 'seekStatus',
      window: Number.isFinite(gap) ? Math.round(gap) : null,
      poolSize: this.matchmaker.poolSize(seek) - 1,
      waitedMs: now - seek.createdAt,
    });
  }

  private tick() {
    const now = this.now();
    this.runMatching(now);
    this.tournaments.tick(now);
    if (now - this.lastSeekStatus >= SEEK_STATUS_INTERVAL_MS) {
      this.lastSeekStatus = now;
      for (const s of this.matchmaker.all()) this.sendSeekStatus(s.playerId, now);
    }
    this.flushLobby();
  }

  // ---- challenges and invite links ----

  private onChallengeMessage(
    player: Player,
    ws: WebSocket,
    msg: Extract<ClientMessage, { t: `challenge${string}` }>,
    now: number,
  ) {
    if (msg.t === 'challengeCreate') {
      const tc = msg.timeControl;
      if (!validTimeControl(tc)) return this.send(ws, err('bad_request', 'Invalid time control'));
      if (!['w', 'b', 'random'].includes(msg.color)) return this.send(ws, err('bad_request', 'Invalid colour'));
      if (this.activeRoomOf(player.id)) return this.send(ws, err('busy', 'Finish your current game first'));
      let to: Player | null = null;
      if (msg.to !== undefined) {
        to = typeof msg.to === 'string' ? (this.store.get(msg.to) ?? null) : null;
        if (!to) return this.send(ws, err('not_found', 'No such player'));
      }
      const created = this.challenges.create(
        {
          from: playerInfo(player, this.ratings.forTimeControl(player.id, tc, this.now())),
          to: to && playerInfo(to, this.ratings.forTimeControl(to.id, tc, this.now())),
          timeControl: tc,
          // Guests never play rated; an open invite is re-checked when someone accepts.
          rated: !!msg.rated && !isGuest(player) && (!to || !isGuest(to)),
          color: msg.color,
        },
        now,
      );
      if (typeof created === 'string') return this.send(ws, challengeErr(created));
      this.sendToPlayer(player.id, { t: 'challenge', challenge: created });
      if (to) this.sendToPlayer(to.id, { t: 'challenge', challenge: created });
      return;
    }

    if (!isChallengeId(msg.id)) return this.send(ws, err('bad_request', 'Invalid challenge id'));

    switch (msg.t) {
      case 'challengeGet': {
        const c = this.challenges.get(msg.id, now);
        if (!c) return this.send(ws, err('not_found', 'This invite has expired or was cancelled'));
        if (c.to && c.to.id !== player.id && c.from.id !== player.id) return this.send(ws, err('not_found', 'This invite is for another player'));
        return this.send(ws, { t: 'challenge', challenge: c });
      }
      case 'challengeAccept': {
        const c = this.challenges.canAccept(msg.id, player.id, now);
        if (typeof c === 'string') return this.send(ws, challengeErr(c));
        const from = this.store.get(c.from.id);
        if (!from) return this.send(ws, err('not_found', 'Challenger not found'));
        if (!this.sockets.has(from.id)) return this.send(ws, err('offline', `${from.name} is not online right now`));
        if (this.activeRoomOf(player.id)) return this.send(ws, err('busy', 'Finish your current game first'));
        if (this.activeRoomOf(from.id)) return this.send(ws, err('busy', `${from.name} is in another game`));
        const fromColor = resolveChallengeColor(c.color);
        const [white, black] = fromColor === 'w' ? [from, player] : [player, from];
        const rated = c.rated && !isGuest(player);
        this.matchmaker.remove(from.id);
        this.matchmaker.remove(player.id);
        const room = this.createGame(white, black, c.timeControl, rated, now);
        const done = this.challenges.markAccepted(c.id, room.id, now) ?? c;
        this.notifyChallengeGone(done, 'accepted', player.id);
        // Other pending challenges from either player are stale now that they are playing.
        for (const id of [from.id, player.id]) for (const other of this.challenges.cancelAllFrom(id)) this.notifyChallengeGone(other, 'cancelled');
        return;
      }
      case 'challengeDecline': {
        const c = this.challenges.decline(msg.id, player.id, now);
        if (typeof c === 'string') return this.send(ws, challengeErr(c));
        return this.notifyChallengeGone(c, 'declined');
      }
      case 'challengeCancel': {
        const c = this.challenges.cancel(msg.id, player.id, now);
        if (typeof c === 'string') return this.send(ws, challengeErr(c));
        return this.notifyChallengeGone(c, 'cancelled');
      }
    }
  }

  private notifyChallengeGone(c: Challenge, reason: ChallengeEndReason, alsoPlayer?: string) {
    const ids = new Set([c.from.id, ...(c.to ? [c.to.id] : []), ...(alsoPlayer ? [alsoPlayer] : [])]);
    for (const id of ids) this.sendToPlayer(id, { t: 'challengeGone', id: c.id, reason });
  }

  private sendToPlayer(playerId: string, msg: ServerMessage) {
    for (const ws of this.sockets.get(playerId) ?? []) this.send(ws, msg);
  }

  // ---- games ----

  private runMatching(now: number) {
    for (const c of this.challenges.sweep(now)) this.notifyChallengeGone(c, 'expired');
    for (const { a, b } of this.matchmaker.tick(now)) {
      const pa = this.store.get(a.playerId);
      const pb = this.store.get(b.playerId);
      if (!pa || !pb) continue;
      const [white, black] = Math.random() < 0.5 ? [pa, pb] : [pb, pa];
      this.createGame(white, black, a.timeControl, a.rated && b.rated, now);
    }
  }

  createGame(white: Player, black: Player, tc: GameRoom['timeControl'], rated: boolean, now: number, tournament?: GameTournamentRef): GameRoom {
    const id = randomUUID().slice(0, 8);
    for (const p of [white, black]) {
      this.matchmaker.remove(p.id);
      this.openGames.removeBy(p.id);
    }
    this.markLobbyDirty();
    const room = new GameRoom(
      id,
      playerInfo(white, this.ratings.forTimeControl(white.id, tc, now)),
      playerInfo(black, this.ratings.forTimeControl(black.id, tc, now)),
      tc,
      rated,
      now,
      {
      onMove: (r, m) => {
        const t = this.now();
        this.opts.persistence?.moveMade(r, m);
        this.broadcast(r, { t: 'moved', gameId: r.id, uci: m.uci, san: m.san, ply: r.game.ply, clock: r.clock, serverNow: t });
        this.schedule(r);
        this.notifyTurnIfAway(r, m.san);
      },
      onDrawOffer: (r, by) => this.broadcast(r, { t: 'drawOffered', gameId: r.id, by }),
      onEnd: (r, outcome) => {
        const { change: ratingChange, unrated } = this.applyRatings(r);
        if (r.tournament) this.tournaments.gameEnded(r.id, { outcome, plies: r.game.ply, terminated: r.terminated });
        this.opts.persistence?.gameEnded(r, outcome, ratingChange);
        if (outcome.reason !== 'aborted') {
          // Grade every move now so Review opens with the badges already there.
          void this.opts.analysis?.precompute({ gameId: r.id, moves: r.game.uciHistory(), initialFen: r.initialFen });
          this.fairPlay.gameFinished({
            gameId: r.id,
            initialFen: r.initialFen,
            moves: r.game.uciHistory(),
            thinkMs: [...r.thinkMs],
            white: { id: r.white.id, rating: ratingChange?.w.before.rating ?? r.white.rating },
            black: { id: r.black.id, rating: ratingChange?.b.before.rating ?? r.black.rating },
            endedAt: this.now(),
            rated: r.rated,
            timeControl: r.timeControl,
            ratingDelta: ratingChange && {
              w: ratingChange.w.after.rating - ratingChange.w.before.rating,
              b: ratingChange.b.after.rating - ratingChange.b.before.rating,
            },
          });
        }
        this.broadcast(r, { t: 'gameOver', gameId: r.id, outcome, ratingChange, unrated });
        clearTimeout(this.timers.get(r.id));
        this.timers.delete(r.id);
        for (const id of [r.white.id, r.black.id]) this.cancelGrace(id);
        this.markLobbyDirty();
        this.onGameEnded(r);
        // Keep finished games briefly so late joiners can read the result and players can rematch.
        setTimeout(() => {
          this.rooms.delete(r.id);
          this.rematchOffers.delete(r.id);
          this.spectators.delete(r.id);
          this.moderation.forgetGame(r.id);
        }, 5 * 60_000).unref();
      },
    });
    room.tournament = tournament;
    this.rooms.set(id, room);
    this.opts.persistence?.gameStarted(room);
    // No engine help once a live game starts.
    this.opts.analysis?.cancel(white.id);
    this.opts.analysis?.cancel(black.id);
    for (const [p, color] of [
      [white, 'w'],
      [black, 'b'],
    ] as const) {
      for (const ws of this.sockets.get(p.id) ?? []) this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
    }
    this.schedule(room);
    this.pushPresence(white.id);
    this.pushPresence(black.id);
    return room;
  }

  // ---- social: presence, spectators, activity ----

  private presenceOf(userId: string): Presence {
    if (!this.sockets.has(userId)) return { status: 'offline' };
    const room = this.activeRoomOf(userId);
    return room ? { status: 'playing', gameId: room.id } : { status: 'online' };
  }

  private liveGamesOf(userIds: Set<string>): LiveGameEntry[] {
    const out: LiveGameEntry[] = [];
    const who = (p: GameRoom['white']) => ({ id: p.id, username: p.name, displayName: p.name, country: null, rating: p.rating });
    for (const r of this.rooms.values()) {
      if (r.outcome || !(userIds.has(r.white.id) || userIds.has(r.black.id))) continue;
      out.push({ gameId: r.id, white: who(r.white), black: who(r.black), timeControl: r.timeControl, rated: r.rated, startedAt: r.createdAt });
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Tells friends and followers that this user's presence changed. */
  private pushPresence(userId: string) {
    if (!this.social || !isAccountId(userId)) return;
    const presence = this.presenceOf(userId);
    this.social
      .audience(userId)
      .then((ids) => {
        for (const id of ids) for (const ws of this.sockets.get(id) ?? []) this.send(ws, { t: 'presence', userId, presence });
      })
      .catch((e) => console.error('presence push failed', e));
  }

  private onGameEnded(r: GameRoom) {
    this.pushPresence(r.white.id);
    this.pushPresence(r.black.id);
    // Spectators get gameOver via broadcast; drop them once the room is gone.
    const o = r.outcome;
    if (!this.social || !o || o.reason === 'aborted') return;
    this.social
      .recordGame({
        gameId: r.id,
        whiteId: r.white.id,
        blackId: r.black.id,
        result: o.result,
        reason: o.reason,
        category: timeCategory(r.timeControl),
        rated: r.rated,
      })
      .catch((e) => console.error('activity record failed', e));
  }

  private unwatch(ws: WebSocket, gameId: string) {
    const set = this.spectators.get(gameId);
    if (!set?.delete(ws)) return;
    if (set.size === 0) this.spectators.delete(gameId);
    const room = this.rooms.get(gameId);
    if (room) this.broadcast(room, { t: 'watching', gameId, spectators: set.size });
  }

  private applyRatings(room: GameRoom): { change?: Record<Color, { before: Rating; after: Rating; delta: number }>; unrated?: string } {
    if (!room.outcome) return { unrated: 'no_result' };
    const w = this.store.get(room.white.id);
    const b = this.store.get(room.black.id);
    const res = this.ratings.applyGame({
      gameId: room.id,
      rated: room.rated,
      whiteId: room.white.id,
      blackId: room.black.id,
      whiteIsGuest: !w || isGuest(w),
      blackIsGuest: !b || isGuest(b),
      timeControl: room.timeControl,
      reason: room.outcome.reason,
      winner: room.outcome.winner,
      plies: room.game.ply,
      endedAt: this.now(),
    });
    if (!res.rated) return { unrated: res.reason };
    return {
      change: {
        w: { before: res.w.before, after: res.w.after, delta: res.w.delta },
        b: { before: res.b.before, after: res.b.after, delta: res.b.delta },
      },
    };
  }

  private schedule(room: GameRoom) {
    clearTimeout(this.timers.get(room.id));
    const ms = room.msUntilNextDeadline(this.now());
    if (ms === null) return;
    this.timers.set(
      room.id,
      setTimeout(() => {
        if (!room.checkTime(this.now())) this.schedule(room);
      }, ms + 5),
    );
  }

  /** Pushes "your turn" to the player to move when they have no open connection (app closed or backgrounded). */
  private notifyTurnIfAway(room: GameRoom, san: string) {
    if (room.outcome) return;
    const toMove = room.game.turn === 'w' ? room.white : room.black;
    const mover = room.game.turn === 'w' ? room.black : room.white;
    if (toMove.id.startsWith('g_') || this.sockets.has(toMove.id)) return;
    this.notifications.notify(toMove.id, yourTurn({ gameId: room.id, opponentName: mover.name, san }));
  }

  private activeRoomOf(playerId: string): GameRoom | undefined {
    for (const r of this.rooms.values()) if (!r.outcome && r.colorOf(playerId)) return r;
    return undefined;
  }

  /** Live counts for the home screen. */
  stats(): ServerStats {
    let gamesInProgress = 0;
    for (const r of this.rooms.values()) if (!r.outcome) gamesInProgress++;
    return { playersOnline: this.sockets.size, gamesInProgress, playersSeeking: this.matchmaker.size, serverNow: this.now() };
  }

  getRoom(id: string) {
    return this.rooms.get(id);
  }

  private broadcast(room: GameRoom, msg: ServerMessage, exceptPlayer?: string) {
    for (const id of [room.white.id, room.black.id]) {
      if (id === exceptPlayer) continue;
      for (const ws of this.sockets.get(id) ?? []) this.send(ws, msg);
    }
    for (const ws of this.spectators.get(room.id) ?? []) this.send(ws, msg);
  }

  /** Sends to every open socket of a player (app open on two devices or tabs). */
  private toPlayer(playerId: string, msg: ServerMessage) {
    for (const ws of this.sockets.get(playerId) ?? []) this.send(ws, msg);
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(encode(msg));
  }
}

function clientIp(req: { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> }): string {
  // Behind a proxy, trust X-Forwarded-For only when TRUST_PROXY is set.
  const fwd = process.env.TRUST_PROXY ? req.headers['x-forwarded-for'] : undefined;
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}
/** Development bearer tokens mirror the WebSocket dev tokens: "dev:<id>:<name>". */
const devHttpAuth: HttpAuth = (token) => {
  if (process.env.NODE_ENV === 'production') return null;
  return /^dev:([\w-]{1,64}):[\w .-]{1,24}$/.exec(token)?.[1] ?? null;
};

function err(code: ErrorCode, message: string): Extract<ServerMessage, { t: 'error' }> {
  return { t: 'error', code, message };
}

function challengeErr(e: ChallengeError): ServerMessage {
  const text: Record<ChallengeError, string> = {
    not_found: 'This invite has expired or was cancelled',
    not_allowed: 'This challenge is for another player',
    too_many: 'You have too many open challenges',
    self: 'You cannot play against yourself',
  };
  return err(e === 'not_found' ? 'not_found' : e === 'too_many' ? 'rate_limited' : 'bad_request', text[e]);
}

function moveErrorText(e: MoveError): string {
  return { not_your_turn: 'Not your turn', illegal_move: 'Illegal move', stale_ply: 'Out of sync', game_over: 'Game is over' }[e];
}

/** Guests play casual games only until they have an account. */
/** A fixed ± rating window: 25 to 1000 points. */
function validWindow(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) && x >= 25 && x <= 1000 ? Math.round(x) : undefined;
}

function validTimeControl(tc: unknown): tc is GameRoom['timeControl'] {
  if (!tc || typeof tc !== 'object') return false;
  const { initialMs, incrementMs } = tc as Record<string, unknown>;
  return (
    typeof initialMs === 'number' &&
    typeof incrementMs === 'number' &&
    initialMs >= 15_000 &&
    initialMs <= 3 * 3600_000 &&
    incrementMs >= 0 &&
    incrementMs <= 180_000 &&
    (initialMs > 0 || incrementMs > 0)
  );
}
