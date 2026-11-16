import {
  PROTOCOL_VERSION,
  decodeClient,
  encode,
  timeCategory,
  updateRating,
  type ClientMessage,
  type Color,
  type ColorChoice,
  type ErrorCode,
  type LobbyState,
  type Rating,
  type ServerMessage,
} from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameRoom, type MoveError } from './gameRoom';
import { GuestSessions } from './guestSessions';
import { Matchmaker, type MatchOptions } from './matchmaker';
import { OpenGames } from './openGames';
import { MemoryPlayerStore, authenticate, playerInfo, ratingFor, type Player, type PlayerStore } from './players';

export interface ServerOptions {
  port: number;
  store?: PlayerStore;
  /** How long a disconnected player may be away before forfeiting. */
  reconnectGraceMs?: number;
  matchIntervalMs?: number;
  match?: Partial<MatchOptions>;
  now?: () => number;
}

/** How often a seeking player hears about their widening rating window. */
const SEEK_STATUS_INTERVAL_MS = 1_000;

interface Connection {
  ws: WebSocket;
  player: Player | null;
}

/**
 * Realtime game server: authentication handshake, matchmaking, and
 * authoritative game rooms. Single-process for now; to scale horizontally,
 * pin each game to one node and route sockets by game id (e.g. via Redis).
 */
export class ChessServer {
  readonly http: HttpServer;
  readonly wss: WebSocketServer;
  private readonly store: PlayerStore;
  private readonly matchmaker: Matchmaker;
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
  private readonly now: () => number;
  private readonly matchTimer: NodeJS.Timeout;

  constructor(private readonly opts: ServerOptions) {
    this.store = opts.store ?? new MemoryPlayerStore();
    this.now = opts.now ?? Date.now;
    this.matchmaker = new Matchmaker(opts.match);
    this.http = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, games: this.rooms.size, seeking: this.matchmaker.size, openGames: this.openGames.size }));
        return;
      }
      res.writeHead(404).end();
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws) => this.onConnection(ws));
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
    for (const t of [...this.timers.values(), ...this.graceTimers.values()]) clearTimeout(t);
    for (const c of this.wss.clients) c.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.http.close(() => r()));
  }

  // ---- connection handling ----

  private onConnection(ws: WebSocket) {
    const conn: Connection = { ws, player: null };
    const helloTimeout = setTimeout(() => !conn.player && ws.close(4001, 'hello timeout'), 10_000);
    ws.on('message', (data) => {
      const msg = decodeClient(String(data));
      if (!msg) return this.send(ws, err('bad_request', 'Malformed message'));
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
      if (conn.player) return this.send(ws, err('bad_request', 'Already said hello'));
      const token = String(msg.token ?? '');
      const resumed = this.guests.resolve(token);
      const player = resumed === undefined ? authenticate(token, this.store) : resumed ? this.store.get(resumed) : undefined;
      if (!player) return ws.close(4003, 'unauthorized');
      conn.player = player;
      const set = this.sockets.get(player.id) ?? new Set();
      const wasOnline = set.size > 0;
      set.add(ws);
      this.sockets.set(player.id, set);
      this.cancelGrace(player.id);
      if (!wasOnline) this.markLobbyDirty();
      this.send(ws, {
        t: 'welcome',
        v: PROTOCOL_VERSION,
        player: { id: player.id, name: player.name, rating: 1500, provisional: true },
        resumeToken: player.id.startsWith('g_') ? this.guests.issue(player.id) : undefined,
      });
      this.resume(ws, player.id, !wasOnline);
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
        this.matchmaker.add({
          playerId: player.id,
          rating: ratingFor(player, tc).rating,
          timeControl: tc,
          rated: !!msg.rated && canPlayRated(player),
          createdAt: now,
          ratingRange: validRange(msg.ratingRange),
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
        const rated = !!msg.rated && canPlayRated(player);
        const game = this.openGames.create(playerInfo(player, tc), tc, rated, color, now, validWindow(msg.range));
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
        if (open.rated && !canPlayRated(player)) return this.send(ws, err('unauthorized', 'Sign in to play rated games'));
        if (!OpenGames.accepts(open, ratingFor(player, open.timeControl).rating))
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
        if (color) return this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
        return this.send(ws, { t: 'gameState', game: room.snapshot(now) });
      }
      case 'move': {
        const room = this.rooms.get(msg.gameId);
        if (!room) return this.send(ws, err('not_found', 'No such game'));
        const res = room.move(player.id, String(msg.uci), Number(msg.ply), now);
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
    this.lobbySubs.delete(ws);
    const set = this.sockets.get(playerId);
    set?.delete(ws);
    if (set && set.size > 0) return;
    this.sockets.delete(playerId);
    this.matchmaker.remove(playerId);
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
    if (now - this.lastSeekStatus >= SEEK_STATUS_INTERVAL_MS) {
      this.lastSeekStatus = now;
      for (const s of this.matchmaker.all()) this.sendSeekStatus(s.playerId, now);
    }
    this.flushLobby();
  }

  // ---- games ----

  private runMatching(now: number) {
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
    for (const p of [white, black]) {
      this.matchmaker.remove(p.id);
      this.openGames.removeBy(p.id);
    }
    this.markLobbyDirty();
    const room = new GameRoom(id, playerInfo(white, tc), playerInfo(black, tc), tc, rated, now, {
      onMove: (r, m) => {
        const t = this.now();
        this.broadcast(r, { t: 'moved', gameId: r.id, uci: m.uci, san: m.san, ply: r.game.ply, clock: r.clock, serverNow: t });
        this.schedule(r);
      },
      onDrawOffer: (r, by) => this.broadcast(r, { t: 'drawOffered', gameId: r.id, by }),
      onEnd: (r, outcome) => {
        const ratingChange = r.rated && outcome.reason !== 'aborted' ? this.applyRatings(r) : undefined;
        this.broadcast(r, { t: 'gameOver', gameId: r.id, outcome, ratingChange });
        clearTimeout(this.timers.get(r.id));
        this.timers.delete(r.id);
        for (const id of [r.white.id, r.black.id]) this.cancelGrace(id);
        this.markLobbyDirty();
        // Keep finished games briefly so late joiners can read the result and players can rematch.
        setTimeout(() => {
          this.rooms.delete(r.id);
          this.rematchOffers.delete(r.id);
        }, 5 * 60_000).unref();
      },
    });
    this.rooms.set(id, room);
    for (const [p, color] of [
      [white, 'w'],
      [black, 'b'],
    ] as const) {
      for (const ws of this.sockets.get(p.id) ?? []) this.send(ws, { t: 'gameStart', game: room.snapshot(now), you: color });
    }
    this.schedule(room);
    return room;
  }

  private applyRatings(room: GameRoom): Record<Color, { before: Rating; after: Rating }> | undefined {
    const w = this.store.get(room.white.id);
    const b = this.store.get(room.black.id);
    if (!w || !b || !room.outcome) return undefined;
    const cat = timeCategory(room.timeControl);
    const rw = ratingFor(w, room.timeControl);
    const rb = ratingFor(b, room.timeControl);
    const score = room.outcome.winner === 'w' ? 1 : room.outcome.winner === 'b' ? 0 : 0.5;
    const nw = updateRating(rw, [{ opponent: rb, score }]);
    const nb = updateRating(rb, [{ opponent: rw, score: 1 - score }]);
    this.store.save({ ...w, ratings: { ...w.ratings, [cat]: nw } });
    this.store.save({ ...b, ratings: { ...b.ratings, [cat]: nb } });
    return { w: { before: rw, after: nw }, b: { before: rb, after: nb } };
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

  getRoom(id: string) {
    return this.rooms.get(id);
  }

  private broadcast(room: GameRoom, msg: ServerMessage, exceptPlayer?: string) {
    for (const id of [room.white.id, room.black.id]) {
      if (id === exceptPlayer) continue;
      for (const ws of this.sockets.get(id) ?? []) this.send(ws, msg);
    }
  }

  /** Sends to every open socket of a player (app open on two devices or tabs). */
  private toPlayer(playerId: string, msg: ServerMessage) {
    for (const ws of this.sockets.get(playerId) ?? []) this.send(ws, msg);
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(encode(msg));
  }
}

function err(code: ErrorCode, message: string): ServerMessage {
  return { t: 'error', code, message };
}

function moveErrorText(e: MoveError): string {
  return { not_your_turn: 'Not your turn', illegal_move: 'Illegal move', stale_ply: 'Out of sync', game_over: 'Game is over' }[e];
}

/** Guests play casual games only until they have an account. */
function canPlayRated(p: Player): boolean {
  return !p.id.startsWith('g_');
}

/** A fixed ± rating window: 25 to 1000 points. */
function validWindow(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) && x >= 25 && x <= 1000 ? Math.round(x) : undefined;
}

function validRange(x: unknown): [number, number] | undefined {
  if (!Array.isArray(x) || x.length !== 2) return undefined;
  const [lo, hi] = x as unknown[];
  return typeof lo === 'number' && typeof hi === 'number' && lo <= hi ? [lo, hi] : undefined;
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
