import {
  arenaPoints,
  validateTournamentInput,
  type GameOutcome,
  type TimeControl,
  type TournamentDetail,
  type TournamentInput,
  type TournamentStanding,
  type TournamentStatus,
  type TournamentSummary,
} from '@chessmate/core';
import {
  getUser,
  insertTournament,
  listTournaments,
  saveTournamentPlayer,
  tournamentPlayersOf,
  updateTournament,
  type Database,
  type Tournament,
} from '@chessmate/db';
import { randomUUID } from 'node:crypto';

export class TournamentError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** What the tournament needs from the game server. */
export interface TournamentBridge {
  isOnline(userId: string): boolean;
  /** Id of the player's live game, if any (tournament or not). */
  liveGameOf(userId: string): string | null;
  rating(userId: string, tc: TimeControl): number;
  /** Starts a tournament game; returns its id, or null when it could not start. */
  startGame(whiteId: string, blackId: string, tc: TimeControl, rated: boolean, tournamentId: string): string | null;
  /** In-app and push notice to a player. */
  notify(userId: string, title: string, body: string, url: string): void;
}

interface Player {
  userId: string;
  username: string;
  rating: number;
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  withdrawn: boolean;
  joinedAt: number;
  /** Not persisted: pairing helpers. */
  lastOpponent?: string;
  lastColor?: 'w' | 'b';
  freeSince?: number;
}

interface Entry {
  row: Tournament;
  players: Map<string, Player>;
  /** Live tournament games: game id → players. */
  games: Map<string, { white: string; black: string }>;
}

/** A player waits this long after a game before the next pairing, to see the result. */
const REST_MS = 4_000;

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

/**
 * Arena tournaments. Staff create them (admin service); players join and
 * withdraw; while one runs, `tick` pairs waiting players with similar scores
 * and `gameEnded` scores results. State lives in memory and is written through
 * to the database.
 */
export class TournamentService {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();
  private bridge: TournamentBridge | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: { db: Database; now?: () => number }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
  }

  async load() {
    for (const row of await listTournaments(this.db, 200)) {
      const players = new Map<string, Player>();
      for (const p of await tournamentPlayersOf(this.db, row.id)) {
        players.set(p.userId, {
          userId: p.userId,
          username: p.username,
          rating: p.rating,
          score: p.score,
          games: p.games,
          wins: p.wins,
          draws: p.draws,
          losses: p.losses,
          streak: p.streak,
          withdrawn: p.withdrawn,
          joinedAt: ms(p.joinedAt),
        });
      }
      this.entries.set(row.id, { row, players, games: new Map() });
    }
  }

  /** Connects the game server and starts the clock that opens, pairs and closes tournaments. */
  attach(bridge: TournamentBridge, intervalMs = 1000) {
    this.bridge = bridge;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private endsAt(row: Tournament) {
    return ms(row.startsAt) + row.durationMinutes * 60_000;
  }

  private get(id: string): Entry {
    const e = this.entries.get(id);
    if (!e) throw new TournamentError(404, 'No such tournament');
    return e;
  }

  private persistPlayer(id: string, p: Player) {
    void saveTournamentPlayer(this.db, {
      tournamentId: id,
      userId: p.userId,
      username: p.username,
      rating: p.rating,
      score: p.score,
      games: p.games,
      wins: p.wins,
      draws: p.draws,
      losses: p.losses,
      streak: p.streak,
      withdrawn: p.withdrawn,
      joinedAt: new Date(p.joinedAt),
    }).catch((e) => console.error('could not save tournament player', e));
  }

  private setStatus(e: Entry, status: TournamentStatus) {
    e.row = { ...e.row, status, finishedAt: status === 'finished' || status === 'cancelled' ? new Date(this.now()) : e.row.finishedAt };
    void updateTournament(this.db, e.row.id, { status, finishedAt: e.row.finishedAt }).catch((err) => console.error('could not save tournament', err));
  }

  // ---------------------------------------------------------------- clock

  tick() {
    const now = this.now();
    for (const e of this.entries.values()) {
      if (e.row.status === 'scheduled' && ms(e.row.startsAt) <= now) {
        this.setStatus(e, 'running');
        for (const p of e.players.values()) {
          if (!p.withdrawn) this.bridge?.notify(p.userId, `${e.row.name} has started`, 'Open the tournament to get your first game.', `/tournaments/${e.row.id}`);
        }
      }
      if (e.row.status === 'running' && this.endsAt(e.row) <= now) this.setStatus(e, 'finished');
      if (e.row.status === 'running') this.pair(e, now);
    }
  }

  /** Pairs every waiting player it can: by score, then rating, avoiding an immediate rematch. */
  private pair(e: Entry, now: number) {
    const b = this.bridge;
    if (!b) return;
    // No new games in the last minute: they could not finish in time.
    if (this.endsAt(e.row) - now < 60_000) return;
    const waiting = [...e.players.values()].filter(
      (p) => !p.withdrawn && b.isOnline(p.userId) && !b.liveGameOf(p.userId) && now - (p.freeSince ?? 0) >= REST_MS,
    );
    waiting.sort((x, y) => y.score - x.score || y.rating - x.rating);
    const used = new Set<string>();
    for (let i = 0; i < waiting.length; i++) {
      const a = waiting[i]!;
      if (used.has(a.userId)) continue;
      let pick: Player | null = null;
      for (let j = i + 1; j < waiting.length; j++) {
        const c = waiting[j]!;
        if (used.has(c.userId)) continue;
        if (!pick) pick = c;
        // Prefer someone they did not just play; fall back to the first free player.
        if (a.lastOpponent !== c.userId && c.lastOpponent !== a.userId) {
          pick = c;
          break;
        }
      }
      if (!pick) break;
      // Whoever had black last time gets white.
      const aWhite = a.lastColor === 'b' || (a.lastColor !== 'w' && pick.lastColor !== 'b');
      const [white, black] = aWhite ? [a, pick] : [pick, a];
      const gameId = b.startGame(white.userId, black.userId, { initialMs: e.row.initialMs, incrementMs: e.row.incrementMs }, e.row.rated, e.row.id);
      if (!gameId) continue;
      used.add(a.userId).add(pick.userId);
      e.games.set(gameId, { white: white.userId, black: black.userId });
      white.lastOpponent = black.userId;
      black.lastOpponent = white.userId;
      white.lastColor = 'w';
      black.lastColor = 'b';
    }
  }

  /** Scores a finished tournament game. Aborted games score nothing. */
  gameEnded(tournamentId: string, gameId: string, outcome: GameOutcome) {
    const e = this.entries.get(tournamentId);
    if (!e) return;
    const g = e.games.get(gameId);
    e.games.delete(gameId);
    if (!g) return;
    const now = this.now();
    for (const [id, color] of [
      [g.white, 'w'],
      [g.black, 'b'],
    ] as const) {
      const p = e.players.get(id);
      if (!p) continue;
      p.freeSince = now;
      if (outcome.reason === 'aborted') continue;
      const result = outcome.winner === null ? 'draw' : outcome.winner === color ? 'win' : 'loss';
      p.score += arenaPoints(result, p.streak);
      p.games += 1;
      if (result === 'win') {
        p.wins += 1;
        p.streak += 1;
      } else {
        if (result === 'draw') p.draws += 1;
        else p.losses += 1;
        p.streak = 0;
      }
      this.persistPlayer(tournamentId, p);
    }
  }

  // ---------------------------------------------------------------- players

  async join(userId: string, id: string): Promise<TournamentDetail> {
    const e = this.get(id);
    if (e.row.status === 'finished' || e.row.status === 'cancelled') throw new TournamentError(409, 'This tournament is over');
    const existing = e.players.get(userId);
    if (existing) {
      existing.withdrawn = false;
      existing.freeSince = 0;
      this.persistPlayer(id, existing);
      return this.detail(userId, id);
    }
    const active = [...e.players.values()].filter((p) => !p.withdrawn).length;
    if (e.row.maxPlayers && active >= e.row.maxPlayers) throw new TournamentError(409, 'This tournament is full');
    const u = await getUser(this.db, userId);
    if (!u || u.closedAt) throw new TournamentError(403, 'Sign in with an open account to join');
    const p: Player = {
      userId,
      username: u.displayName || u.username,
      rating: Math.round(this.bridge?.rating(userId, { initialMs: e.row.initialMs, incrementMs: e.row.incrementMs }) ?? 1500),
      score: 0,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      streak: 0,
      withdrawn: false,
      joinedAt: this.now(),
    };
    e.players.set(userId, p);
    this.persistPlayer(id, p);
    return this.detail(userId, id);
  }

  /** Leaves (before the start) or pauses (while running: no new pairings, points kept). */
  withdraw(userId: string, id: string): TournamentDetail {
    const e = this.get(id);
    const p = e.players.get(userId);
    if (!p) throw new TournamentError(404, 'You have not joined this tournament');
    p.withdrawn = true;
    this.persistPlayer(id, p);
    return this.detail(userId, id);
  }

  // ---------------------------------------------------------------- views

  private summary(e: Entry, viewer: string | null): TournamentSummary {
    const r = e.row;
    const standings = this.standings(e);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status as TournamentStatus,
      timeControl: { initialMs: r.initialMs, incrementMs: r.incrementMs },
      rated: r.rated,
      startsAt: ms(r.startsAt),
      durationMinutes: r.durationMinutes,
      endsAt: this.endsAt(r),
      maxPlayers: r.maxPlayers,
      prizePool: r.prizePool,
      prizes: r.prizes ?? [],
      players: [...e.players.values()].filter((p) => !p.withdrawn || p.games > 0).length,
      joined: !!viewer && !!e.players.get(viewer) && !e.players.get(viewer)!.withdrawn,
      winner: r.status === 'finished' && standings[0] && standings[0].games > 0 ? standings[0].username : null,
    };
  }

  private standings(e: Entry): TournamentStanding[] {
    const playing = new Set<string>();
    for (const g of e.games.values()) playing.add(g.white).add(g.black);
    const list = [...e.players.values()].filter((p) => !p.withdrawn || p.games > 0);
    list.sort((a, b) => b.score - a.score || b.wins - a.wins || b.rating - a.rating || a.joinedAt - b.joinedAt);
    return list.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      username: p.username,
      rating: p.rating,
      score: p.score,
      games: p.games,
      wins: p.wins,
      draws: p.draws,
      losses: p.losses,
      onFire: p.streak >= 2,
      withdrawn: p.withdrawn,
      playing: playing.has(p.userId),
    }));
  }

  list(viewer: string | null): TournamentSummary[] {
    const order: Record<string, number> = { running: 0, scheduled: 1, finished: 2, cancelled: 3 };
    return [...this.entries.values()]
      .map((e) => this.summary(e, viewer))
      .sort((a, b) => order[a.status]! - order[b.status]! || (a.status === 'scheduled' ? a.startsAt - b.startsAt : b.startsAt - a.startsAt));
  }

  detail(viewer: string | null, id: string): TournamentDetail {
    const e = this.get(id);
    let yourGameId: string | null = null;
    const liveGames: TournamentDetail['liveGames'] = [];
    for (const [gameId, g] of e.games) {
      liveGames.push({ gameId, white: e.players.get(g.white)?.username ?? '?', black: e.players.get(g.black)?.username ?? '?' });
      if (viewer && (g.white === viewer || g.black === viewer)) yourGameId = gameId;
    }
    return { ...this.summary(e, viewer), standings: this.standings(e), liveGames, yourGameId };
  }

  // ---------------------------------------------------------------- staff

  async create(input: unknown, createdBy: string): Promise<TournamentDetail> {
    const v = validateTournamentInput(input, this.now());
    if ('error' in v) throw new TournamentError(400, v.error);
    const row = await insertTournament(this.db, {
      id: randomUUID().slice(0, 10),
      ...this.columns(v.value),
      status: 'scheduled',
      createdBy,
    });
    this.entries.set(row.id, { row, players: new Map(), games: new Map() });
    return this.detail(null, row.id);
  }

  private columns(v: TournamentInput) {
    return {
      name: v.name,
      description: v.description,
      initialMs: v.timeControl.initialMs,
      incrementMs: v.timeControl.incrementMs,
      rated: v.rated,
      startsAt: new Date(v.startsAt),
      durationMinutes: v.durationMinutes,
      maxPlayers: v.maxPlayers,
      prizePool: v.prizePool,
      prizes: v.prizes,
    };
  }

  private inputOf(row: Tournament): TournamentInput {
    return {
      name: row.name,
      description: row.description,
      timeControl: { initialMs: row.initialMs, incrementMs: row.incrementMs },
      rated: row.rated,
      startsAt: ms(row.startsAt),
      durationMinutes: row.durationMinutes,
      maxPlayers: row.maxPlayers,
      prizePool: row.prizePool,
      prizes: row.prizes ?? [],
    };
  }

  /** Edits a tournament. Time control and start can only change before it starts; prizes and text any time. */
  async update(id: string, input: unknown): Promise<TournamentDetail> {
    const e = this.get(id);
    if (e.row.status === 'cancelled') throw new TournamentError(409, 'This tournament was cancelled');
    const v = validateTournamentInput(input, this.now(), this.inputOf(e.row));
    if ('error' in v) throw new TournamentError(400, v.error);
    let cols = this.columns(v.value);
    if (e.row.status !== 'scheduled') {
      // Running or finished: keep the clock and the schedule.
      cols = { ...cols, initialMs: e.row.initialMs, incrementMs: e.row.incrementMs, rated: e.row.rated, startsAt: new Date(e.row.startsAt) };
    }
    await updateTournament(this.db, id, cols);
    e.row = { ...e.row, ...cols };
    return this.detail(null, id);
  }

  cancel(id: string): TournamentDetail {
    const e = this.get(id);
    if (e.row.status === 'finished' || e.row.status === 'cancelled') throw new TournamentError(409, 'This tournament is already over');
    this.setStatus(e, 'cancelled');
    for (const p of e.players.values()) if (!p.withdrawn) this.bridge?.notify(p.userId, `${e.row.name} was cancelled`, 'The tournament will not take place.', `/tournaments/${id}`);
    return this.detail(null, id);
  }

  async startNow(id: string): Promise<TournamentDetail> {
    const e = this.get(id);
    if (e.row.status !== 'scheduled') throw new TournamentError(409, 'Only a scheduled tournament can be started');
    const startsAt = new Date(this.now());
    await updateTournament(this.db, id, { startsAt });
    e.row = { ...e.row, startsAt };
    this.tick();
    return this.detail(null, id);
  }

  /** Whether a game belongs to a tournament (for the game screen). */
  tournamentOfGame(gameId: string): string | null {
    for (const e of this.entries.values()) if (e.games.has(gameId)) return e.row.id;
    return null;
  }
}
