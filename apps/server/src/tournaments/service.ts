import {
  ARENA_REPAIR_DELAY_MS,
  SWISS_ROUND_BREAK_MS,
  TOURNAMENT_REMINDER_MS,
  awardPrizes,
  formatPrize,
  formatTimeControl,
  ordinal,
  pairArena,
  pairSwiss,
  rankEntrants,
  resultPoints,
  tournamentEndsAt,
  validateTournamentSettings,
  type AdminTournament,
  type AwardedPrize,
  type EntrantStatus,
  type GameOutcome,
  type GameTournamentRef,
  type JoinBlock,
  type PairingEntrant,
  type Side,
  type TimeControl,
  type TournamentDetail,
  type TournamentList,
  type TournamentPairing,
  type TournamentPlayerRef,
  type TournamentResult,
  type TournamentSettings,
  type TournamentStanding,
  type TournamentStatus,
  type TournamentSummary,
  type TournamentViewerState,
} from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import type { NotifyInput } from '../notifications/templates';

export type TournamentErrorCode = 'not_found' | 'conflict' | 'invalid_input' | 'forbidden' | 'unauthorized';

export class TournamentError extends Error {
  constructor(
    readonly code: TournamentErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export interface Entry {
  userId: string;
  username: string;
  rating: number;
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  colorBalance: number;
  lastColor: Side | null;
  hadBye: boolean;
  opponents: string[];
  status: EntrantStatus;
  prize: AwardedPrize | null;
  joinedAt: number;
  /** In memory only: live game id, and when the player became free (arena pairing delay). */
  playing: string | null;
  freeSince: number;
}

export interface TGame {
  gameId: string;
  round: number;
  white: TournamentPlayerRef;
  black: TournamentPlayerRef | null;
  result: TournamentResult;
  startedAt: number;
  endedAt: number | null;
}

export interface Tournament extends TournamentSettings {
  id: string;
  status: TournamentStatus;
  currentRound: number;
  cancelReason: string | null;
  reminded: boolean;
  winnerId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  players: Map<string, Entry>;
  games: Map<string, TGame>;
  /** In memory only: when the last game of the current swiss round ended. */
  roundDoneAt: number | null;
}

/** Write-through storage; the service keeps everything in memory. */
export interface TournamentStore {
  load(): Promise<Tournament[]>;
  saveTournament(t: Tournament): void;
  savePlayer(tournamentId: string, e: Entry): void;
  deletePlayer(tournamentId: string, userId: string): void;
  saveGame(tournamentId: string, g: TGame): void;
  flush(): Promise<void>;
}

export class MemoryTournamentStore implements TournamentStore {
  async load() {
    return [];
  }
  saveTournament() {}
  savePlayer() {}
  deletePlayer() {}
  saveGame() {}
  async flush() {}
}

/** What the service needs from the running game server. */
export interface TournamentBridge {
  /** Starts a live game between two players; null when either cannot play right now. */
  startGame(ref: GameTournamentRef, tc: TimeControl, rated: boolean, whiteId: string, blackId: string): { gameId: string; white: TournamentPlayerRef; black: TournamentPlayerRef } | null;
  isOnline(userId: string): boolean;
  /** In a live game outside this tournament (or any game). */
  busy(userId: string): boolean;
  rating(userId: string, tc: TimeControl): number;
  /** Not closed by staff or for fair play. */
  canPlay(userId: string): boolean;
  /** Ends a live game with no result (tournament cancelled). */
  terminate(gameId: string): void;
  notify(userId: string, n: NotifyInput): void;
}

export interface Viewer {
  userId: string;
  username: string;
}

export interface TournamentServiceOptions {
  store?: TournamentStore;
  now?: () => number;
  log?: (msg: string) => void;
}

/** After an arena's end, live games may finish for this long before the results are final. */
const ARENA_OVERTIME_MS = 15 * 60_000;
const PAIRINGS_SHOWN = 60;
const FINISHED_LISTED = 30;

const isGuestId = (id: string) => id.startsWith('g_');

/**
 * Runs every tournament: registration, the start, pairings (continuous for
 * arenas, round by round for swiss), scores, the end with final places and
 * prizes, and notifications along the way. State lives in memory and is
 * written through to the store; the game server calls `tick` twice a second
 * and `gameEnded` when a tournament game finishes.
 */
export class TournamentService {
  private readonly store: TournamentStore;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private readonly tournaments = new Map<string, Tournament>();
  /** game id → tournament id */
  private readonly gameIndex = new Map<string, string>();
  private bridge: TournamentBridge | null = null;

  constructor(opts: TournamentServiceOptions = {}) {
    this.store = opts.store ?? new MemoryTournamentStore();
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[tournaments] ${m}`));
  }

  /** Loads saved tournaments. Games that were live when the server stopped no longer exist, so they count as void. */
  async load(): Promise<void> {
    for (const t of await this.store.load()) {
      this.tournaments.set(t.id, t);
      for (const g of t.games.values()) {
        if (g.result === '*' && t.status === 'running') {
          g.result = 'void';
          g.endedAt = this.now();
          this.store.saveGame(t.id, g);
        }
        if (g.result === '*') this.gameIndex.set(g.gameId, t.id);
      }
    }
  }

  attach(bridge: TournamentBridge) {
    this.bridge = bridge;
  }

  private get b(): TournamentBridge {
    if (!this.bridge) throw new TournamentError('conflict', 'Tournaments are not running on this server');
    return this.bridge;
  }

  flush() {
    return this.store.flush();
  }

  /** The tournament a live game belongs to, for the game screen. */
  refFor(gameId: string): GameTournamentRef | undefined {
    const t = this.tournaments.get(this.gameIndex.get(gameId) ?? '');
    const g = t?.games.get(gameId);
    return t && g ? { id: t.id, name: t.name, round: g.round } : undefined;
  }

  isTournamentGame(gameId: string): boolean {
    return this.gameIndex.has(gameId);
  }

  private get(id: string): Tournament {
    const t = this.tournaments.get(id);
    if (!t) throw new TournamentError('not_found', 'No such tournament');
    return t;
  }

  // ---------------------------------------------------------------- views

  list(viewerId: string | null): TournamentList {
    const all = [...this.tournaments.values()];
    return {
      live: all.filter((t) => t.status === 'running').sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0)).map((t) => this.summary(t, viewerId)),
      upcoming: all.filter((t) => t.status === 'scheduled').sort((a, b) => a.startsAt - b.startsAt).map((t) => this.summary(t, viewerId)),
      finished: all
        .filter((t) => t.status === 'finished' || (t.status === 'cancelled' && !!viewerId && this.entered(t, viewerId)))
        .sort((a, b) => (b.endedAt ?? b.startsAt) - (a.endedAt ?? a.startsAt))
        .slice(0, FINISHED_LISTED)
        .map((t) => this.summary(t, viewerId)),
    };
  }

  detail(id: string, viewer: Viewer | null): TournamentDetail {
    const t = this.get(id);
    const standings = this.standings(t);
    const pairings = [...t.games.values()]
      .sort((a, b) => b.startedAt - a.startedAt || b.round - a.round)
      .slice(0, PAIRINGS_SHOWN)
      .map((g): TournamentPairing => ({ gameId: g.gameId, round: g.round, white: g.white, black: g.black, result: g.result, startedAt: g.startedAt }));
    const allDone = t.format === 'swiss' && t.status === 'running' && t.roundDoneAt !== null;
    return {
      ...this.summary(t, viewer?.userId ?? null),
      standings,
      pairings,
      cancelReason: t.cancelReason,
      me: viewer ? this.viewerState(t, viewer, standings) : null,
      nextRoundAt: allDone && t.currentRound < (t.rounds ?? 0) ? t.roundDoneAt! + SWISS_ROUND_BREAK_MS : null,
    };
  }

  adminList(status: string): AdminTournament[] {
    return [...this.tournaments.values()]
      .filter((t) => status === 'all' || t.status === status)
      .sort((a, b) => (status === 'scheduled' ? a.startsAt - b.startsAt : b.startsAt - a.startsAt))
      .map((t) => this.adminView(t.id, false));
  }

  adminView(id: string, full = true): AdminTournament {
    const t = this.get(id);
    const d = full ? this.detail(id, null) : { ...this.summary(t, null), standings: [], pairings: [], cancelReason: t.cancelReason, me: null, nextRoundAt: null };
    const prizes = [...t.players.values()].filter((e) => e.prize);
    return { ...d, createdBy: t.createdByName, createdAt: t.createdAt, prizesAwarded: prizes.length, prizesPaid: prizes.filter((e) => e.prize!.paidAt).length };
  }

  private entered(t: Tournament, userId: string) {
    const e = t.players.get(userId);
    return !!e && e.status !== 'removed';
  }

  private summary(t: Tournament, viewerId: string | null): TournamentSummary {
    const winner = t.winnerId ? t.players.get(t.winnerId) : undefined;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      format: t.format,
      timeControl: t.timeControl,
      rated: t.rated,
      status: t.status,
      startsAt: t.startsAt,
      endsAt: t.status === 'finished' || t.status === 'cancelled' ? t.endedAt : tournamentEndsAt(t),
      durationMinutes: t.durationMinutes,
      rounds: t.rounds,
      currentRound: t.currentRound,
      players: [...t.players.values()].filter((e) => e.status !== 'removed').length,
      maxPlayers: t.maxPlayers,
      minRating: t.minRating,
      maxRating: t.maxRating,
      prizePool: t.prizePool,
      winner: winner ? { id: winner.userId, username: winner.username } : null,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      joined: !!viewerId && this.entered(t, viewerId),
    };
  }

  private standings(t: Tournament): TournamentStanding[] {
    return rankEntrants(t.format, [...t.players.values()]).map((e) => ({
      rank: e.rank,
      userId: e.userId,
      username: e.username,
      rating: e.rating,
      score: e.score,
      games: e.games,
      wins: e.wins,
      draws: e.draws,
      losses: e.losses,
      streak: e.streak,
      buchholz: e.buchholz,
      status: e.status,
      prize: e.prize,
      playingGameId: e.playing,
    }));
  }

  private viewerState(t: Tournament, viewer: Viewer, standings: TournamentStanding[]): TournamentViewerState {
    const e = t.players.get(viewer.userId);
    const block = this.joinBlock(t, viewer.userId);
    const rejoinable = !e || e.status === 'paused' || e.status === 'withdrawn';
    return {
      status: e?.status ?? null,
      rank: e ? (standings.find((s) => s.userId === viewer.userId)?.rank ?? null) : null,
      gameId: e?.playing ?? null,
      canJoin: !block && rejoinable,
      joinBlock: block,
      rating: isGuestId(viewer.userId) ? null : this.bridge?.rating(viewer.userId, t.timeControl) ?? null,
    };
  }

  private joinBlock(t: Tournament, userId: string): JoinBlock | null {
    if (isGuestId(userId)) return 'guest';
    if (this.bridge && !this.bridge.canPlay(userId)) return 'closed';
    if (t.status === 'finished' || t.status === 'cancelled') return 'finished';
    const e = t.players.get(userId);
    if (e?.status === 'removed') return 'removed';
    if (t.status === 'running') {
      const end = tournamentEndsAt(t);
      if (end !== null && this.now() >= end) return 'finished';
      if (t.format === 'swiss' && t.currentRound >= (t.rounds ?? 0)) return 'last_round';
    }
    if (!e && t.maxPlayers !== null) {
      const count = [...t.players.values()].filter((x) => x.status !== 'removed').length;
      if (count >= t.maxPlayers) return 'full';
    }
    if (!e && this.bridge) {
      const r = this.bridge.rating(userId, t.timeControl);
      if (t.minRating !== null && r < t.minRating) return 'rating_low';
      if (t.maxRating !== null && r > t.maxRating) return 'rating_high';
    }
    return null;
  }

  // ---------------------------------------------------------------- players

  join(viewer: Viewer, id: string): TournamentDetail {
    const t = this.get(id);
    const block = this.joinBlock(t, viewer.userId);
    if (block) throw new TournamentError(block === 'guest' ? 'unauthorized' : 'conflict', JOIN_BLOCK_MESSAGE[block]);
    const now = this.now();
    const existing = t.players.get(viewer.userId);
    if (existing) {
      if (existing.status === 'active') throw new TournamentError('conflict', 'You have already joined');
      existing.status = 'active';
      existing.freeSince = now;
      existing.username = viewer.username;
      this.store.savePlayer(t.id, existing);
    } else {
      const e: Entry = {
        userId: viewer.userId,
        username: viewer.username,
        rating: Math.round(this.b.rating(viewer.userId, t.timeControl)),
        score: 0,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        streak: 0,
        colorBalance: 0,
        lastColor: null,
        hadBye: false,
        opponents: [],
        status: 'active',
        prize: null,
        joinedAt: now,
        playing: null,
        freeSince: now,
      };
      t.players.set(e.userId, e);
      this.store.savePlayer(t.id, e);
    }
    return this.detail(id, viewer);
  }

  leave(viewer: Viewer, id: string): TournamentDetail {
    const t = this.get(id);
    const e = t.players.get(viewer.userId);
    if (!e || e.status === 'removed') throw new TournamentError('not_found', 'You are not in this tournament');
    if (t.status === 'scheduled') {
      t.players.delete(viewer.userId);
      this.store.deletePlayer(t.id, viewer.userId);
    } else if (t.status === 'running') {
      if (e.status !== 'active') throw new TournamentError('conflict', 'You have already left');
      // A game in progress is still played out and counts.
      e.status = t.format === 'arena' ? 'paused' : 'withdrawn';
      this.store.savePlayer(t.id, e);
    } else throw new TournamentError('conflict', 'This tournament is over');
    return this.detail(id, viewer);
  }

  // ---------------------------------------------------------------- staff

  create(raw: unknown, by: Viewer): Tournament {
    const v = validateTournamentSettings(raw, this.now());
    if ('error' in v) throw new TournamentError('invalid_input', v.error, v.field);
    const t: Tournament = {
      ...v.value,
      id: randomUUID(),
      status: 'scheduled',
      currentRound: 0,
      cancelReason: null,
      reminded: false,
      winnerId: null,
      createdBy: by.userId,
      createdByName: by.username,
      createdAt: this.now(),
      startedAt: null,
      endedAt: null,
      players: new Map(),
      games: new Map(),
      roundDoneAt: null,
    };
    this.tournaments.set(t.id, t);
    this.store.saveTournament(t);
    this.log(`${by.username} created "${t.name}" (${t.format} ${formatTimeControl(t.timeControl)}) starting ${new Date(t.startsAt).toISOString()}`);
    return t;
  }

  /**
   * Scheduled tournaments can change anything. Once running or finished only
   * the name, description and prize pool can change; a new prize pool after
   * the end re-assigns the prizes (keeping paid marks where nothing changed).
   */
  update(id: string, raw: unknown): { tournament: Tournament; changed: string[] } {
    const t = this.get(id);
    if (t.status === 'cancelled') throw new TournamentError('conflict', 'This tournament was cancelled');
    const merged = { ...this.settingsOf(t), ...(raw && typeof raw === 'object' ? raw : {}) };
    const v = validateTournamentSettings(merged, this.now(), { allowPast: t.status !== 'scheduled' || (merged as TournamentSettings).startsAt === t.startsAt });
    if ('error' in v) throw new TournamentError('invalid_input', v.error, v.field);
    const before = this.settingsOf(t);
    const next = t.status === 'scheduled' ? v.value : { ...before, name: v.value.name, description: v.value.description, prizePool: v.value.prizePool };
    if (t.status !== 'scheduled') {
      for (const k of ['format', 'timeControl', 'rated', 'startsAt', 'durationMinutes', 'rounds', 'maxPlayers', 'minRating', 'maxRating'] as const) {
        if (JSON.stringify(v.value[k]) !== JSON.stringify(before[k])) throw new TournamentError('conflict', 'Only the name, description and prizes can change after the start', k);
      }
    }
    const changed = (Object.keys(next) as (keyof TournamentSettings)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
    Object.assign(t, next);
    if (changed.includes('startsAt')) t.reminded = false;
    this.store.saveTournament(t);
    if (t.status === 'finished' && changed.includes('prizePool')) this.assignPrizes(t);
    return { tournament: t, changed };
  }

  private settingsOf(t: Tournament): TournamentSettings {
    return {
      name: t.name,
      description: t.description,
      format: t.format,
      timeControl: t.timeControl,
      rated: t.rated,
      startsAt: t.startsAt,
      durationMinutes: t.durationMinutes,
      rounds: t.rounds,
      maxPlayers: t.maxPlayers,
      minRating: t.minRating,
      maxRating: t.maxRating,
      prizePool: t.prizePool,
    };
  }

  /** Starts a scheduled tournament now instead of at its start time. */
  startNow(id: string): Tournament {
    const t = this.get(id);
    if (t.status !== 'scheduled') throw new TournamentError('conflict', 'Only a scheduled tournament can be started');
    if (this.activeEntries(t).length < 2) throw new TournamentError('conflict', 'At least 2 players have to join first');
    const now = this.now();
    // An arena keeps its length from the moment it actually starts.
    t.startsAt = now;
    this.start(t, now);
    return t;
  }

  cancel(id: string, reason: string): Tournament {
    const t = this.get(id);
    if (t.status !== 'scheduled' && t.status !== 'running') throw new TournamentError('conflict', 'This tournament is already over');
    const now = this.now();
    for (const g of t.games.values()) {
      if (g.result !== '*') continue;
      this.closeGame(t, g, 'void', now);
      this.b.terminate(g.gameId);
    }
    t.status = 'cancelled';
    t.cancelReason = reason;
    t.endedAt = now;
    this.store.saveTournament(t);
    for (const e of this.activeEntries(t, true)) {
      this.b.notify(e.userId, { kind: 'tournament', title: `${t.name} was cancelled`, body: reason, url: `/tournaments/${t.id}`, data: { tournamentId: t.id, status: 'cancelled' } });
    }
    return t;
  }

  /** Ends a running tournament now. Games still in progress do not count. */
  finishNow(id: string): Tournament {
    const t = this.get(id);
    if (t.status !== 'running') throw new TournamentError('conflict', 'Only a running tournament can be ended');
    for (const g of t.games.values()) if (g.result === '*') this.b.terminate(g.gameId);
    this.finalize(t, this.now());
    return t;
  }

  removePlayer(id: string, userId: string, reason: string): { tournament: Tournament; entry: Entry } {
    const t = this.get(id);
    const e = t.players.get(userId);
    if (!e || e.status === 'removed') throw new TournamentError('not_found', 'This player is not in the tournament');
    if (t.status === 'finished' || t.status === 'cancelled') throw new TournamentError('conflict', 'This tournament is over');
    e.status = 'removed';
    this.store.savePlayer(t.id, e);
    if (e.playing) this.b.terminate(e.playing);
    this.b.notify(userId, { kind: 'tournament', title: `You were removed from ${t.name}`, body: reason, url: `/tournaments/${t.id}`, data: { tournamentId: t.id, status: 'removed' } });
    return { tournament: t, entry: e };
  }

  setPrizePaid(id: string, userId: string, paid: boolean): { tournament: Tournament; entry: Entry } {
    const t = this.get(id);
    const e = t.players.get(userId);
    if (!e?.prize) throw new TournamentError('not_found', 'This player has no prize');
    e.prize = { ...e.prize, paidAt: paid ? this.now() : null };
    this.store.savePlayer(t.id, e);
    if (paid) {
      this.b.notify(userId, {
        kind: 'tournament',
        title: `Your prize from ${t.name} was paid`,
        body: `${formatPrize(e.prize.amount, e.prize.currency)}${e.prize.label ? ` + ${e.prize.label}` : ''} for ${ordinal(e.prize.place)} place.`,
        url: `/tournaments/${t.id}`,
        data: { tournamentId: t.id, status: 'prize_paid' },
      });
    }
    return { tournament: t, entry: e };
  }

  // ---------------------------------------------------------------- running

  private activeEntries(t: Tournament, includeLeft = false): Entry[] {
    return [...t.players.values()].filter((e) => e.status === 'active' || (includeLeft && (e.status === 'paused' || e.status === 'withdrawn')));
  }

  /** Called by the game server twice a second. */
  tick(now = this.now()): void {
    if (!this.bridge) return;
    for (const t of this.tournaments.values()) {
      try {
        if (t.status === 'scheduled') this.tickScheduled(t, now);
        else if (t.status === 'running') {
          if (t.format === 'arena') this.tickArena(t, now);
          else this.tickSwiss(t, now);
        }
      } catch (e) {
        this.log(`tick failed for ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  private tickScheduled(t: Tournament, now: number) {
    if (!t.reminded && t.startsAt - now <= TOURNAMENT_REMINDER_MS && t.startsAt > now) {
      t.reminded = true;
      this.store.saveTournament(t);
      for (const e of this.activeEntries(t)) {
        this.b.notify(e.userId, {
          kind: 'tournament',
          title: `${t.name} starts soon`,
          body: `Starts in ${Math.max(1, Math.round((t.startsAt - now) / 60_000))} minutes. Open the tournament to be paired.`,
          url: `/tournaments/${t.id}`,
          data: { tournamentId: t.id, status: 'starting' },
          collapseKey: `tournament:${t.id}`,
        });
      }
    }
    if (now < t.startsAt) return;
    if (this.activeEntries(t).length < 2) {
      this.cancel(t.id, 'Not enough players joined');
      return;
    }
    this.start(t, now);
  }

  private start(t: Tournament, now: number) {
    t.status = 'running';
    t.startedAt = now;
    t.roundDoneAt = null;
    for (const e of t.players.values()) {
      e.rating = Math.round(this.b.rating(e.userId, t.timeControl));
      e.freeSince = now - ARENA_REPAIR_DELAY_MS;
      this.store.savePlayer(t.id, e);
    }
    this.store.saveTournament(t);
    this.log(`"${t.name}" started with ${this.activeEntries(t).length} players`);
    for (const e of this.activeEntries(t)) {
      this.b.notify(e.userId, {
        kind: 'tournament',
        title: `${t.name} has started`,
        body: t.format === 'arena' ? 'Open the tournament to get your first game.' : 'Round 1 is being paired. Open the tournament to play.',
        url: `/tournaments/${t.id}`,
        data: { tournamentId: t.id, status: 'started' },
        collapseKey: `tournament:${t.id}`,
      });
    }
    if (t.format === 'swiss') this.pairSwissRound(t, now);
  }

  private tickArena(t: Tournament, now: number) {
    const end = tournamentEndsAt(t)!;
    const live = [...t.games.values()].some((g) => g.result === '*');
    if (now >= end) {
      if (!live || now >= end + ARENA_OVERTIME_MS) {
        for (const g of t.games.values()) if (g.result === '*') this.b.terminate(g.gameId);
        this.finalize(t, now);
      }
      return;
    }
    // Leave room for one more game before the end.
    const est = t.timeControl.initialMs * 2 + t.timeControl.incrementMs * 60;
    if (end - now < Math.min(est, 60_000)) return;
    const waiting = this.activeEntries(t).filter(
      (e) => !e.playing && now - e.freeSince >= ARENA_REPAIR_DELAY_MS && this.b.isOnline(e.userId) && !this.b.busy(e.userId) && this.b.canPlay(e.userId),
    );
    if (waiting.length < 2) return;
    const { pairs } = pairArena(waiting.map(toPairing));
    for (const [w, b] of pairs) this.startPairing(t, w, b, t.games.size + 1, now);
  }

  private tickSwiss(t: Tournament, now: number) {
    const round = [...t.games.values()].filter((g) => g.round === t.currentRound);
    if (round.some((g) => g.result === '*')) return;
    if (t.roundDoneAt === null) {
      t.roundDoneAt = now;
      if (t.currentRound >= (t.rounds ?? 0)) return this.finalize(t, now);
      return;
    }
    if (now - t.roundDoneAt < SWISS_ROUND_BREAK_MS) return;
    if (this.activeEntries(t).length < 2) return this.finalize(t, now);
    this.pairSwissRound(t, now);
  }

  private pairSwissRound(t: Tournament, now: number) {
    t.currentRound += 1;
    t.roundDoneAt = null;
    this.store.saveTournament(t);
    const entrants = this.activeEntries(t);
    const { pairs, bye } = pairSwiss(entrants.map(toPairing), t.currentRound);
    if (bye) {
      const e = t.players.get(bye)!;
      const g: TGame = { gameId: `bye-${t.currentRound}-${e.userId}`, round: t.currentRound, white: ref(e), black: null, result: '*', startedAt: now, endedAt: null };
      e.hadBye = true;
      t.games.set(g.gameId, g);
      this.closeGame(t, g, 'bye', now);
    }
    for (const [w, b] of pairs) this.startPairing(t, w, b, t.currentRound, now);
  }

  /** Creates the live game, or records a forfeit when a player cannot play. */
  private startPairing(t: Tournament, whiteId: string, blackId: string, round: number, now: number) {
    const w = t.players.get(whiteId)!;
    const b = t.players.get(blackId)!;
    for (const [e, color, opp] of [
      [w, 'w', b],
      [b, 'b', w],
    ] as const) {
      e.opponents.push(opp.userId);
      e.colorBalance += color === 'w' ? 1 : -1;
      e.lastColor = color;
    }
    const absent = (e: Entry) => !this.b.canPlay(e.userId) || this.b.busy(e.userId);
    const wOut = absent(w);
    const bOut = absent(b);
    const started = wOut || bOut ? null : this.b.startGame({ id: t.id, name: t.name, round }, t.timeControl, t.rated, whiteId, blackId);
    const g: TGame = {
      gameId: started?.gameId ?? `ff-${round}-${randomUUID().slice(0, 8)}`,
      round,
      white: started?.white ?? ref(w),
      black: started?.black ?? ref(b),
      result: '*',
      startedAt: now,
      endedAt: null,
    };
    t.games.set(g.gameId, g);
    if (!started) {
      // Whoever could not be seated forfeits; both out means nobody scores.
      const result: TournamentResult = t.format === 'arena' || wOut === bOut ? 'void' : wOut ? '-+' : '+-';
      this.closeGame(t, g, result, now);
      if (wOut) this.dropNoShow(t, w);
      if (bOut) this.dropNoShow(t, b);
      return;
    }
    this.gameIndex.set(g.gameId, t.id);
    w.playing = g.gameId;
    b.playing = g.gameId;
    this.store.saveGame(t.id, g);
    for (const e of [w, b]) {
      this.store.savePlayer(t.id, e);
      if (!this.b.isOnline(e.userId)) {
        const opp = e === w ? b : w;
        this.b.notify(e.userId, {
          kind: 'tournament',
          title: `${t.name}: your game started`,
          body: `${t.format === 'swiss' ? `Round ${round} against ` : 'You were paired with '}${opp.username}. Move within 30 seconds or you forfeit.`,
          url: '/play/online',
          data: { tournamentId: t.id, gameId: g.gameId, status: 'paired' },
          collapseKey: `tournament:${t.id}`,
        });
      }
    }
  }

  /** A player who did not show up stops being paired until they come back. */
  private dropNoShow(t: Tournament, e: Entry) {
    if (e.status !== 'active') return;
    e.status = t.format === 'arena' ? 'paused' : 'withdrawn';
    this.store.savePlayer(t.id, e);
  }

  /** Called by the game server when a tournament game ends. */
  gameEnded(gameId: string, info: { outcome: GameOutcome; plies: number; terminated: boolean }): void {
    const tid = this.gameIndex.get(gameId);
    const t = tid ? this.tournaments.get(tid) : undefined;
    const g = t?.games.get(gameId);
    if (!t || !g || g.result !== '*') return;
    const now = this.now();
    let result: TournamentResult;
    let noShow: Side | null = null;
    if (info.terminated) result = 'void';
    else if (info.outcome.reason === 'aborted') {
      // Tournament games cannot be aborted by hand: this side never made its first move.
      noShow = info.plies === 0 ? 'w' : 'b';
      result = t.format === 'swiss' ? (noShow === 'w' ? '-+' : '+-') : 'void';
    } else result = info.outcome.result === '1-0' ? '1-0' : info.outcome.result === '0-1' ? '0-1' : '1/2-1/2';
    this.closeGame(t, g, result, now);
    if (noShow) {
      const e = t.players.get(noShow === 'w' ? g.white.id : g.black!.id);
      if (e) this.dropNoShow(t, e);
    }
  }

  private closeGame(t: Tournament, g: TGame, result: TournamentResult, now: number) {
    g.result = result;
    g.endedAt = now;
    this.gameIndex.delete(g.gameId);
    this.store.saveGame(t.id, g);
    if (t.status !== 'running') return;
    for (const [side, r] of [
      ['w', g.white],
      ['b', g.black],
    ] as const) {
      if (!r) continue;
      const e = t.players.get(r.id);
      if (!e) continue;
      if (e.playing === g.gameId) e.playing = null;
      e.freeSince = now;
      const p = resultPoints(t.format, result, side, e.streak);
      if (result === 'bye') e.score += p.points;
      else if (p.outcome !== 'none') {
        e.score += p.points;
        e.streak = p.streak;
        e.games += 1;
        if (p.outcome === 'win') e.wins += 1;
        else if (p.outcome === 'draw') e.draws += 1;
        else e.losses += 1;
      }
      this.store.savePlayer(t.id, e);
    }
  }

  private finalize(t: Tournament, now: number) {
    for (const g of t.games.values()) if (g.result === '*') this.closeGame(t, g, 'void', now);
    t.status = 'finished';
    t.endedAt = now;
    for (const e of t.players.values()) e.playing = null;
    const ranked = this.assignPrizes(t);
    const total = ranked.filter((r) => r.status !== 'removed').length;
    this.log(`"${t.name}" finished; winner ${t.winnerId ? t.players.get(t.winnerId)?.username : 'none'}`);
    for (const r of ranked) {
      if (r.status === 'removed' || r.games === 0) continue;
      const e = t.players.get(r.userId)!;
      const prize = e.prize ? ` You won ${formatPrize(e.prize.amount, e.prize.currency)}${e.prize.label ? ` + ${e.prize.label}` : ''}.` : '';
      this.b.notify(r.userId, {
        kind: 'tournament',
        title: `${t.name} has finished`,
        body: `You finished ${ordinal(r.rank)} of ${total} with ${r.score} points.${prize}`,
        url: `/tournaments/${t.id}`,
        data: { tournamentId: t.id, status: 'finished', rank: String(r.rank) },
        collapseKey: `tournament:${t.id}`,
      });
    }
  }

  /** Final places, prizes and winner; keeps the paid mark where the same prize stays with the same player. */
  private assignPrizes(t: Tournament) {
    const ranked = rankEntrants(t.format, [...t.players.values()]);
    const prizes = awardPrizes(ranked, t.prizePool);
    for (const e of t.players.values()) {
      const next = prizes.get(e.userId) ?? null;
      const same = next && e.prize && e.prize.place === next.place && e.prize.amount === next.amount && e.prize.currency === next.currency;
      e.prize = next ? { ...next, paidAt: same ? e.prize!.paidAt : null } : null;
      this.store.savePlayer(t.id, e);
    }
    const top = ranked.find((r) => r.status !== 'removed' && r.games > 0);
    t.winnerId = top?.userId ?? null;
    this.store.saveTournament(t);
    return ranked;
  }
}

const ref = (e: Entry): TournamentPlayerRef => ({ id: e.userId, username: e.username, rating: e.rating });

const toPairing = (e: Entry): PairingEntrant => ({ id: e.userId, score: e.score, rating: e.rating, opponents: e.opponents, colorBalance: e.colorBalance, hadBye: e.hadBye, lastColor: e.lastColor });

const JOIN_BLOCK_MESSAGE: Record<JoinBlock, string> = {
  signed_out: 'Sign in to join tournaments',
  guest: 'Create an account to join tournaments',
  closed: 'Your account cannot play online',
  full: 'This tournament is full',
  rating_low: 'Your rating is below the minimum for this tournament',
  rating_high: 'Your rating is above the maximum for this tournament',
  finished: 'This tournament is over',
  last_round: 'The last round has already started',
  removed: 'You were removed from this tournament',
};
