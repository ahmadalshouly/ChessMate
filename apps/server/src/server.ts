import {
  PROTOCOL_VERSION,
  decodeClient,
  encode,
  type ClientMessage,
  type Color,
  type ErrorCode,
  type Rating,
  type ServerMessage,
  canSeekRated,
  sanitizeRatingRange,
} from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameRoom, type MoveError } from './gameRoom';
import type { HttpRoute } from './auth/http';
import type { AuthService } from './auth/service';
import { Matchmaker } from './matchmaker';
import type { GamePersistence } from './persistence';
import { MemoryPlayerStore, authenticate, isGuest, playerInfo, type Player, type PlayerStore } from './players';
import { RatingService } from './ratingService';

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
  now?: () => number;
}

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
  readonly ratings: RatingService;
  private readonly matchmaker = new Matchmaker();
  private readonly rooms = new Map<string, GameRoom>();
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly matchTimer: NodeJS.Timeout;

  constructor(private readonly opts: ServerOptions) {
    this.store = opts.store ?? new MemoryPlayerStore();
    this.ratings = opts.ratings ?? new RatingService();
    this.now = opts.now ?? Date.now;
    this.http = createServer(async (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, games: this.rooms.size, seeking: this.matchmaker.size }));
        return;
      }
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
    this.wss.on('connection', (ws) => this.onConnection(ws));
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
    for (const t of [...this.timers.values(), ...this.graceTimers.values()]) clearTimeout(t);
    for (const c of this.wss.clients) c.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.http.close(() => r()));
    await this.opts.persistence?.flush();
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
      const player = authenticate(msg.token, this.store, this.opts.auth && ((t) => this.opts.auth!.verifyAccessToken(t)));
      if (!player) return ws.close(4003, 'unauthorized');
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
          this.broadcast(room, { t: 'opponentConnection', gameId: room.id, connected: true }, player.id);
        }
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

  private cancelGrace(playerId: string) {
    const t = this.graceTimers.get(playerId);
    if (t) clearTimeout(t);
    this.graceTimers.delete(playerId);
  }

  // ---- games ----

  private runMatching() {
    const now = this.now();
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
        this.broadcast(r, { t: 'gameOver', gameId: r.id, outcome, ratingChange });
        clearTimeout(this.timers.get(r.id));
        this.timers.delete(r.id);
        // Keep finished games briefly so late joiners can read the result.
        setTimeout(() => this.rooms.delete(r.id), 5 * 60_000).unref();
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

function err(code: ErrorCode, message: string): ServerMessage {
  return { t: 'error', code, message };
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
