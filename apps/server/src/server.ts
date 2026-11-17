import {
  PROTOCOL_VERSION,
  isChallengeId,
  resolveChallengeColor,
  decodeClient,
  encode,
  timeCategory,
  type Challenge,
  type ChallengeEndReason,
  type ClientMessage,
  type Color,
  type ErrorCode,
  type GameAnalyzer,
  type Rating,
  type ServerMessage,
  canSeekRated,
  sanitizeRatingRange,
} from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ChallengeBook, type ChallengeError, type ChallengeLimits } from './challenges';
import { handleAdmin } from './admin';
import { CoachService } from './coach/coachService';
import { createCoachHttpHandler } from './coach/http';
import { GameRoom, type MoveError } from './gameRoom';
import type { HttpRoute } from './auth/http';
import type { AuthService } from './auth/service';
import { Matchmaker } from './matchmaker';
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
}

interface Connection {
  ws: WebSocket;
  player: Player | null;
  limiter: ConnectionLimiter;
}

/** Close code sent to an account closed for fair-play violations. */
export const CLOSE_FAIR_PLAY_BAN = 4010;
/** Close code for clients that keep ignoring rate limits. */
export const CLOSE_RATE_LIMITED = 4008;

const LIMIT_KIND: Partial<Record<ClientMessage['t'], LimitKind>> = { move: 'moves', seek: 'seeks', cancelSeek: 'seeks' };

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
  private readonly matchmaker = new Matchmaker();
  private readonly challenges: ChallengeBook;
  private readonly rooms = new Map<string, GameRoom>();
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly matchTimer: NodeJS.Timeout;
  readonly moderation: Moderation;
  readonly fairPlay: FairPlayService;
  private readonly limits: RateLimitConfig;
  private readonly ipLimiter: IpLimiter;

  constructor(private readonly opts: ServerOptions) {
    this.store = opts.store ?? new MemoryPlayerStore();
    this.ratings = opts.ratings ?? new RatingService();
    this.now = opts.now ?? Date.now;
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
    });
    this.fairPlay.onBan = (id) => this.kickBanned(id);
    const admin = createAdminHandler(this.fairPlay, fp.adminToken ?? process.env.FAIRPLAY_ADMIN_TOKEN);
    const coachHttp = createCoachHttpHandler({
      service: opts.coach ?? new CoachService(),
      analyzer: opts.analyzer,
      authorize: (token) => authenticate(token, this.store, this.opts.auth && ((t) => this.opts.auth!.verifyAccessToken(t)))?.id ?? null,
      now: this.now,
    });
    this.http = createServer(async (req, res) => {
      if (req.url?.startsWith('/coach/')) {
        await coachHttp(req, res);
        return;
      }
      if (await admin(req, res)) return;
      if (handleAdmin(req, res, this.moderation, opts.adminToken)) return;
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, games: this.rooms.size, seeking: this.matchmaker.size }));
        return;
      }
      if (handlePublicApi(req, res, api)) return;
      const url = new URL(req.url ?? '/', 'http://localhost');
      for (const route of opts.http ?? []) {
        try {
          if (await route(req, res, url)) return;
        } catch (e) {
          console.error('[http]', e);
          if (!res.headersSent) res.writeHead(500);
          res.end();
          return;
        }
      }
      res.writeHead(404).end();
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws, req) => {
      if (!this.ipLimiter.allow(clientIp(req), this.now())) return ws.close(CLOSE_RATE_LIMITED, 'too many connections');
      this.onConnection(ws);
    });
    this.matchTimer = setInterval(() => this.runMatching(), opts.matchIntervalMs ?? 500);
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
    for (const t of [...this.timers.values(), ...this.graceTimers.values()]) clearTimeout(t);
    for (const c of this.wss.clients) c.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.http.close(() => r()));
    await this.opts.persistence?.flush();
  }

  // ---- connection handling ----

  private onConnection(ws: WebSocket) {
    const conn: Connection = { ws, player: null, limiter: new ConnectionLimiter(this.limits, this.now()) };
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
      if (conn.player) this.onDisconnect(conn.player.id, ws);
    });
  }

  private onMessage(conn: Connection, msg: ClientMessage) {
    const { ws } = conn;
    if (msg.t === 'hello') {
      if (msg.v !== PROTOCOL_VERSION) return this.send(ws, err('bad_request', 'Unsupported protocol version'));
      const player = authenticate(msg.token, this.store, this.opts.auth && ((t) => this.opts.auth!.verifyAccessToken(t)));
      if (!player) return ws.close(4003, 'unauthorized');
      if (this.fairPlay.isBanned(player.id)) return ws.close(CLOSE_FAIR_PLAY_BAN, 'account closed for fair play violation');
      conn.player = player;
      const set = this.sockets.get(player.id) ?? new Set();
      set.add(ws);
      this.sockets.set(player.id, set);
      this.cancelGrace(player.id);
      this.send(ws, { t: 'welcome', v: PROTOCOL_VERSION, player: playerInfo(player, this.ratings.get(player.id, 'blitz', this.now())) });
      // Resume any game in progress.
      for (const room of this.rooms.values()) {
        const color = room.colorOf(player.id);
        if (color && !room.outcome) {
          this.send(ws, { t: 'gameStart', game: room.snapshot(this.now()), you: color });
          this.send(ws, { t: 'chatHistory', gameId: room.id, lines: this.moderation.chatLog(room.id) });
          this.broadcast(room, { t: 'opponentConnection', gameId: room.id, connected: true }, player.id);
        }
      }
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
        });
        return this.send(ws, { t: 'seeking', timeControl: tc });
      }
      case 'cancelSeek':
        this.matchmaker.remove(player.id);
        return this.send(ws, { t: 'seekCancelled' });
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
      default:
        return this.send(ws, err('bad_request', 'Unknown message'));
    }
  }

  private withRoom(ws: WebSocket, gameId: string, fn: (r: GameRoom) => boolean) {
    const room = this.rooms.get(gameId);
    if (!room) return this.send(ws, err('not_found', 'No such game'));
    if (!fn(room)) this.send(ws, err('bad_request', 'Action not allowed now'));
  }

  private onDisconnect(playerId: string, ws: WebSocket) {
    const set = this.sockets.get(playerId);
    set?.delete(ws);
    if (set && set.size > 0) return;
    this.sockets.delete(playerId);
    this.matchmaker.remove(playerId);
    const room = this.activeRoomOf(playerId);
    if (!room) return;
    this.broadcast(room, { t: 'opponentConnection', gameId: room.id, connected: false }, playerId);
    const grace = this.opts.reconnectGraceMs ?? 60_000;
    this.graceTimers.set(
      playerId,
      setTimeout(() => {
        this.graceTimers.delete(playerId);
        if (!this.sockets.has(playerId)) room.abandon(playerId, this.now());
      }, grace),
    );
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

  private runMatching() {
    const now = this.now();
    for (const c of this.challenges.sweep(now)) this.notifyChallengeGone(c, 'expired');
    for (const { a, b } of this.matchmaker.tick(now)) {
      const pa = this.store.get(a.playerId);
      const pb = this.store.get(b.playerId);
      if (!pa || !pb) continue;
      const [white, black] = Math.random() < 0.5 ? [pa, pb] : [pb, pa];
      this.createGame(white, black, a.timeControl, a.rated && b.rated, now);
    }
  }

  createGame(white: Player, black: Player, tc: GameRoom['timeControl'], rated: boolean, now: number): GameRoom {
    const id = randomUUID().slice(0, 8);
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
      },
      onDrawOffer: (r, by) => this.broadcast(r, { t: 'drawOffered', gameId: r.id, by }),
      onEnd: (r, outcome) => {
        const ratingChange = this.applyRatings(r);
        this.opts.persistence?.gameEnded(r, outcome, ratingChange);
        if (outcome.reason !== 'aborted') {
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
        this.broadcast(r, { t: 'gameOver', gameId: r.id, outcome, ratingChange });
        clearTimeout(this.timers.get(r.id));
        this.timers.delete(r.id);
        // Keep finished games briefly so late joiners can read the result.
        setTimeout(() => {
          this.rooms.delete(r.id);
          this.moderation.forgetGame(r.id);
        }, 5 * 60_000).unref();
      },
    });
    this.rooms.set(id, room);
    this.opts.persistence?.gameStarted(room);
    for (const [p, color] of [
      [white, 'w'],
      [black, 'b'],
    ] as const) {
      for (const ws of this.sockets.get(p.id) ?? []) this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
    }
    this.schedule(room);
    return room;
  }

  private applyRatings(room: GameRoom): Record<Color, { before: Rating; after: Rating; delta: number }> | undefined {
    if (!room.outcome) return undefined;
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
    if (!res.rated) return undefined;
    return {
      w: { before: res.w.before, after: res.w.after, delta: res.w.delta },
      b: { before: res.b.before, after: res.b.after, delta: res.b.delta },
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

function err(code: ErrorCode, message: string): ServerMessage {
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
