import {
  arenaPoints,
  isAdSpot,
  nextRun,
  swissPairings,
  swissPoints,
  tournamentSettings,
  formatMoney,
  validatePayoutRequest,
  validateSponsorApplication,
  validateTournamentInput,
  type GameOutcome,
  type PayoutMethod,
  type PayoutRequestView,
  type PayoutStatus,
  type SponsorApplicationView,
  type SponsorStatus,
  type TimeControl,
  type TournamentCurrency,
  type TournamentDetail,
  type TournamentInput,
  type TournamentStanding,
  type TournamentStatus,
  type TournamentSummary,
  type TournamentViewer,
  type TournamentSettings,
  type TournamentResult,
  type TournamentChatMessage,
  type TournamentGameView,
  type TournamentInvitee,
  CHAT_RATE,
  PAYOUT_STATUSES,
  PRIVATE_TOURNAMENT_BLOCKED,
  SPONSOR_STATUSES,
  prepareChat,
} from '@chessmate/core';
import {
  findUserByUsername,
  getUser,
  insertPayment,
  insertPayoutRequest,
  insertSponsorApplication,
  insertTournament,
  insertTournamentMessage,
  listPayoutRequests,
  listSponsorApplications,
  listTournaments,
  paymentBySession,
  paymentsOf,
  saveTournamentGame,
  saveTournamentPlayer,
  setTournamentMessageHidden,
  tournamentGamesOf,
  tournamentMessagesOf,
  setPaymentStatus,
  tournamentPlayersOf,
  updatePayoutRequest,
  updateSponsorApplication,
  updateTournament,
  type Database,
  type PayoutRequest,
  type SponsorApplication,
  type Tournament,
  type TournamentGame,
  type TournamentMessage,
} from '@chessmate/db';
import { createHash, randomUUID } from 'node:crypto';

import type { StripeClient } from '../payments/stripe';

export class TournamentError extends Error {
  constructor(
    readonly status: 400 | 402 | 403 | 404 | 409 | 503,
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
  /** Rating and number of rated games in this speed. */
  rating(userId: string, tc: TimeControl): { rating: number; games: number };
  /** Starts a tournament game (frenzy: players may halve their clock); returns its id, or null when it could not start. */
  startGame(whiteId: string, blackId: string, tc: TimeControl, rated: boolean, tournamentId: string, frenzy?: boolean): string | null;
  /** In-app and push notice to a player. */
  notify(userId: string, title: string, body: string, url: string): void;
  /** Why this account may not post in chat right now (restricted, muted), or null. */
  chatBlockedReason?(userId: string): string | null;
  /** A chat message was posted, hidden or shown again: tell everyone following the tournament. */
  chatEvent?(tournamentId: string, event: { kind: 'posted'; message: TournamentChatMessage } | { kind: 'hidden'; messageId: string; hidden: boolean; message?: TournamentChatMessage }): void;
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
  /** Wins in a row. */
  streak: number;
  drawRun: number;
  lossRun: number;
  /** Swiss: opponents met (one per round played), colours had and byes. */
  opponents: string[];
  colors: ('w' | 'b')[];
  byes: number;
  withdrawn: boolean;
  disqualified: boolean;
  paid: boolean;
  rulesAcceptedAt: number | null;
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
  /** Swiss: when the last game of the current round ended. */
  roundDoneAt: number;
  /** Every game the tournament started, oldest first. */
  results: TournamentGame[];
  /** Chat, oldest first (the latest CHAT_KEEP messages). */
  chat: TournamentMessage[];
}

/** Chat messages kept in memory per tournament (and loaded on start). */
const CHAT_KEEP = 500;
/** Chat messages sent to players at once. */
const CHAT_PAGE = 200;

/** A player waits this long after a game before the next pairing, to see the result. */
const REST_MS = 4_000;
/** Swiss: pause between rounds, to read the standings. */
const SWISS_BREAK_MS = 15_000;

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

export interface AdminTournamentPlayer {
  userId: string;
  username: string;
  rating: number;
  score: number;
  games: number;
  withdrawn: boolean;
  disqualified: boolean;
  paid: boolean;
  rulesAcceptedAt: number | null;
  joinedAt: number;
  playing: boolean;
}

export interface AdminTournamentView extends TournamentDetail {
  roster: AdminTournamentPlayer[];
  payments: { userId: string; amountCents: number; currency: string; status: string; createdAt: number }[];
  revenueCents: number;
  /** Every game, including aborted ones and games still running, newest first. */
  allGames: TournamentGameView[];
  /** The whole chat, hidden messages included. */
  chat: TournamentChatMessage[];
}

/**
 * Arena tournaments. Staff create them (admin service); players join (after
 * accepting the rules, and paying on the web when there is an entry fee) and
 * withdraw; while one runs, `tick` pairs waiting players with similar scores
 * and `gameEnded` scores results. Also keeps sponsor applications and prize
 * payout requests for staff to review. State lives in memory and is written
 * through to the database.
 */
export class TournamentService {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();
  private readonly payouts = new Map<string, PayoutRequest>();
  private readonly chatTimes = new Map<string, number[]>();
  private bridge: TournamentBridge | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stripe: StripeClient | null;

  constructor(opts: { db: Database; now?: () => number; stripe?: StripeClient | null }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
    this.stripe = opts.stripe ?? null;
  }

  /** Whether entry fees can be paid here (Stripe keys are configured). */
  get paymentsEnabled(): boolean {
    return !!this.stripe;
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
          drawRun: p.state?.drawRun ?? 0,
          lossRun: p.state?.lossRun ?? 0,
          opponents: p.state?.opponents ?? [],
          colors: p.state?.colors ?? [],
          byes: p.state?.byes ?? 0,
          withdrawn: p.withdrawn,
          disqualified: p.disqualified,
          paid: p.paid,
          rulesAcceptedAt: p.rulesAcceptedAt ? ms(p.rulesAcceptedAt) : null,
          joinedAt: ms(p.joinedAt),
        });
      }
      const results = await tournamentGamesOf(this.db, row.id);
      const chat = await tournamentMessagesOf(this.db, row.id, CHAT_KEEP);
      this.entries.set(row.id, { row, players, games: new Map(), roundDoneAt: 0, results, chat });
    }
    for (const r of await listPayoutRequests(this.db, 1000)) this.payouts.set(`${r.tournamentId}:${r.userId}`, r);
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

  private settings(e: Entry): TournamentSettings {
    return tournamentSettings(e.row.settings);
  }

  private swiss(e: Entry) {
    return this.settings(e).format === 'swiss';
  }

  /** Points as players see them: Swiss points are stored doubled (½ points). */
  private shown(e: Entry, score: number) {
    return this.swiss(e) ? score / 2 : score;
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
      state: { drawRun: p.drawRun, lossRun: p.lossRun, opponents: p.opponents, colors: p.colors, byes: p.byes },
      withdrawn: p.withdrawn,
      disqualified: p.disqualified,
      paid: p.paid,
      rulesAcceptedAt: p.rulesAcceptedAt ? new Date(p.rulesAcceptedAt) : null,
      joinedAt: new Date(p.joinedAt),
    }).catch((e) => console.error('could not save tournament player', e));
  }

  private setStatus(e: Entry, status: TournamentStatus) {
    e.row = { ...e.row, status, finishedAt: status === 'finished' || status === 'cancelled' ? new Date(this.now()) : e.row.finishedAt };
    void updateTournament(this.db, e.row.id, { status, finishedAt: e.row.finishedAt }).catch((err) => console.error('could not save tournament', err));
  }

  private active(p: Player) {
    return !p.withdrawn && !p.disqualified;
  }

  /** Private tournaments: whether this account is on the invite list. Open tournaments: everyone. */
  private invitedTo(e: Entry, userId: string) {
    return !e.row.private || (e.row.invited ?? []).some((x) => x.userId === userId);
  }

  // ---------------------------------------------------------------- clock

  tick() {
    const now = this.now();
    for (const e of this.entries.values()) {
      if (e.row.status === 'scheduled' && ms(e.row.startsAt) <= now) {
        this.setStatus(e, 'running');
        for (const p of e.players.values()) {
          if (this.active(p)) this.bridge?.notify(p.userId, `${e.row.name} has started`, 'Open the tournament to get your first game.', `/tournaments/${e.row.id}`);
        }
      }
      if (e.row.status !== 'running') continue;
      const s = this.settings(e);
      if (this.endsAt(e.row) <= now) {
        // Time is up. "timer" ends now (running games do not count); "wait" lets them finish first.
        if (s.endMode === 'timer' || e.games.size === 0) this.finish(e);
        continue;
      }
      if (s.format === 'swiss') {
        if (e.games.size === 0 && now - e.roundDoneAt >= SWISS_BREAK_MS) {
          if (e.row.currentRound >= s.rounds) this.finish(e);
          else this.pairSwissRound(e, now);
        }
      } else this.pair(e, now);
    }
  }

  private finish(e: Entry) {
    // Games cut off by the timer end without counting.
    for (const gameId of e.games.keys()) {
      const rec = e.results.find((r) => r.gameId === gameId);
      if (rec && rec.result === '*') {
        rec.endReason = 'tournament_over';
        rec.endedAt = new Date(this.now());
        this.persistGame(rec);
      }
    }
    e.games.clear();
    this.setStatus(e, 'finished');
    this.announceWinners(e);
  }

  /** Who may be paired now: active, paid when there is a fee, online and not in another game. */
  private available(e: Entry, p: Player) {
    const b = this.bridge;
    return !!b && this.active(p) && this.invitedTo(e, p.userId) && (e.row.entryFeeCents === 0 || p.paid) && b.isOnline(p.userId) && !b.liveGameOf(p.userId);
  }

  /**
   * Starts the next Swiss round: everyone available plays a player on a
   * similar score they have not met; an odd player out gets a bye (a win).
   * Players who are away sit the round out with no points.
   */
  private pairSwissRound(e: Entry, now: number) {
    const b = this.bridge;
    if (!b) return;
    const ready = [...e.players.values()].filter((p) => this.available(e, p));
    if (ready.length < 2) return;
    const round = e.row.currentRound + 1;
    e.row = { ...e.row, currentRound: round };
    void updateTournament(this.db, e.row.id, { currentRound: round }).catch((err) => console.error('could not save tournament round', err));
    const { pairs, bye } = swissPairings(ready.map((p) => ({ id: p.userId, score: p.score, rating: p.rating, opponents: p.opponents, colors: p.colors, byes: p.byes })));
    const s = this.settings(e);
    if (bye) {
      const p = e.players.get(bye)!;
      p.byes += 1;
      p.score += swissPoints('win');
      this.persistPlayer(e.row.id, p);
      b.notify(p.userId, `${e.row.name}: round ${round}`, 'You have a bye this round: it counts as a win.', `/tournaments/${e.row.id}`);
    }
    for (const [whiteId, blackId] of pairs) {
      const gameId = b.startGame(whiteId, blackId, { initialMs: e.row.initialMs, incrementMs: e.row.incrementMs }, e.row.rated, e.row.id, s.frenzy);
      if (!gameId) continue;
      e.games.set(gameId, { white: whiteId, black: blackId });
      this.recordStart(e, gameId, whiteId, blackId, round);
      const white = e.players.get(whiteId)!;
      const black = e.players.get(blackId)!;
      white.opponents.push(blackId);
      black.opponents.push(whiteId);
      white.colors.push('w');
      black.colors.push('b');
      this.persistPlayer(e.row.id, white);
      this.persistPlayer(e.row.id, black);
    }
    // Nobody could start (players left between checks): try again after the break.
    if (e.games.size === 0) e.roundDoneAt = now;
  }

  /** Tells prize winners they won and how to ask for their prize. */
  private announceWinners(e: Entry) {
    const prizes = e.row.prizes ?? [];
    if (!prizes.length) return;
    for (const s of this.standings(e)) {
      const prize = prizes.find((p) => p.place === s.rank);
      if (prize && s.games > 0) {
        this.bridge?.notify(s.userId, `You placed #${s.rank} in ${e.row.name}`, `Your prize: ${prize.prize}. Open the tournament to request your payout.`, `/tournaments/${e.row.id}`);
      }
    }
  }

  /** Arena: pairs every waiting player it can, by score, then rating, avoiding an immediate rematch. */
  private pair(e: Entry, now: number) {
    const b = this.bridge;
    if (!b) return;
    const s = this.settings(e);
    // Ending on the timer: no new games in the last minute, they could not finish in time.
    if (s.endMode === 'timer' && this.endsAt(e.row) - now < 60_000) return;
    const waiting = [...e.players.values()].filter((p) => this.available(e, p) && now - (p.freeSince ?? 0) >= REST_MS);
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
      const gameId = b.startGame(white.userId, black.userId, { initialMs: e.row.initialMs, incrementMs: e.row.incrementMs }, e.row.rated, e.row.id, s.frenzy);
      if (!gameId) continue;
      used.add(a.userId).add(pick.userId);
      e.games.set(gameId, { white: white.userId, black: black.userId });
      this.recordStart(e, gameId, white.userId, black.userId, null);
      white.lastOpponent = black.userId;
      black.lastOpponent = white.userId;
      white.lastColor = 'w';
      black.lastColor = 'b';
    }
  }

  /**
   * Scores a finished tournament game. Aborted games score nothing, and
   * neither do games still running when a tournament ended on its timer.
   */
  gameEnded(tournamentId: string, gameId: string, outcome: GameOutcome, frenzy: { w: boolean; b: boolean } = { w: false, b: false }) {
    const e = this.entries.get(tournamentId);
    if (!e) return;
    const g = e.games.get(gameId);
    e.games.delete(gameId);
    if (!g) return;
    const now = this.now();
    const s = this.settings(e);
    const rec = e.results.find((r) => r.gameId === gameId);
    const counts = e.row.status === 'running' && outcome.reason !== 'aborted';
    const points = { w: 0, b: 0 };
    for (const [id, color] of [
      [g.white, 'w'],
      [g.black, 'b'],
    ] as const) {
      const p = e.players.get(id);
      if (!p) continue;
      p.freeSince = now;
      if (e.row.status !== 'running' || outcome.reason === 'aborted' || p.disqualified) continue;
      const result: TournamentResult = outcome.winner === null ? 'draw' : outcome.winner === color ? 'win' : 'loss';
      const before = p.score;
      if (s.format === 'swiss') p.score += swissPoints(result);
      else p.score = Math.max(0, p.score + arenaPoints(result, { wins: p.streak, draws: p.drawRun, losses: p.lossRun }, s, frenzy[color]));
      points[color] = p.score - before;
      const run = nextRun({ wins: p.streak, draws: p.drawRun, losses: p.lossRun }, result);
      p.streak = run.wins;
      p.drawRun = run.draws;
      p.lossRun = run.losses;
      p.games += 1;
      if (result === 'win') p.wins += 1;
      else if (result === 'draw') p.draws += 1;
      else p.losses += 1;
      this.persistPlayer(tournamentId, p);
    }
    if (rec) {
      rec.result = outcome.result as TournamentGame['result'];
      rec.endReason = outcome.reason;
      rec.counted = counts && !!outcome.result && outcome.result !== '*';
      rec.whitePoints = points.w;
      rec.blackPoints = points.b;
      rec.endedAt = new Date(now);
      this.persistGame(rec);
    }
    if (e.games.size === 0) e.roundDoneAt = now;
  }

  private recordStart(e: Entry, gameId: string, whiteId: string, blackId: string, round: number | null) {
    const rec: TournamentGame = {
      tournamentId: e.row.id,
      gameId,
      round,
      whiteId,
      blackId,
      whiteName: e.players.get(whiteId)?.username ?? whiteId,
      blackName: e.players.get(blackId)?.username ?? blackId,
      result: '*',
      endReason: null,
      counted: false,
      whitePoints: 0,
      blackPoints: 0,
      startedAt: new Date(this.now()),
      endedAt: null,
    };
    e.results.push(rec);
    this.persistGame(rec);
  }

  private persistGame(rec: TournamentGame) {
    void saveTournamentGame(this.db, rec).catch((err) => console.error('could not save tournament game', err));
  }

  private gameView(e: Entry, r: TournamentGame): TournamentGameView {
    return {
      gameId: r.gameId,
      round: r.round,
      white: { userId: r.whiteId, username: r.whiteName, points: this.shown(e, r.whitePoints) },
      black: { userId: r.blackId, username: r.blackName, points: this.shown(e, r.blackPoints) },
      result: (['1-0', '0-1', '1/2-1/2'].includes(r.result) ? r.result : '*') as TournamentGameView['result'],
      endReason: r.endReason,
      counted: r.counted,
      startedAt: ms(r.startedAt),
      endedAt: r.endedAt ? ms(r.endedAt) : null,
    };
  }

  // ---------------------------------------------------------------- chat

  private chatView(m: TournamentMessage, staffView: boolean): TournamentChatMessage {
    return {
      id: m.id,
      userId: m.userId,
      username: m.username,
      text: m.body,
      staff: m.staff,
      at: ms(m.createdAt),
      ...(staffView && m.hiddenAt ? { hidden: true, hiddenBy: m.hiddenBy } : {}),
    };
  }

  /** The chat as players see it: the latest messages, hidden ones left out. */
  chat(id: string): TournamentChatMessage[] {
    const e = this.get(id);
    return e.chat
      .filter((m) => !m.hiddenAt)
      .slice(-CHAT_PAGE)
      .map((m) => this.chatView(m, false));
  }

  /**
   * Posts to the tournament chat. Anyone with an account may talk, except
   * players staff removed and accounts that are restricted or muted. Staff
   * posts (from the admin view) are marked as such.
   */
  async postChat(userId: string, id: string, input: { text?: unknown }, opts: { staff?: boolean; username?: string } = {}): Promise<TournamentChatMessage> {
    const e = this.get(id);
    if (!opts.staff) {
      if (e.row.status === 'cancelled') throw new TournamentError(409, 'This tournament was cancelled');
      if (e.players.get(userId)?.disqualified) throw new TournamentError(403, 'You were removed from this tournament');
      // Private tournaments: spectators watch and read; the invited players and staff talk.
      if (!this.invitedTo(e, userId)) throw new TournamentError(403, 'Only invited players can chat in this tournament');
      const blocked = this.bridge?.chatBlockedReason?.(userId);
      if (blocked) throw new TournamentError(403, blocked);
    }
    const prepared = prepareChat(input.text);
    if (!prepared) throw new TournamentError(400, 'Write a message first');
    const now = this.now();
    const times = (this.chatTimes.get(userId) ?? []).filter((t) => now - t < CHAT_RATE.windowMs);
    if (!opts.staff && times.length >= CHAT_RATE.max) throw new TournamentError(409, 'Slow down: too many messages');
    times.push(now);
    this.chatTimes.set(userId, times);
    let username = opts.username ?? e.players.get(userId)?.username;
    if (!username) {
      const u = await getUser(this.db, userId);
      if (!u || u.closedAt) throw new TournamentError(403, 'Sign in with an open account to chat');
      username = u.displayName || u.username;
    }
    const row = await insertTournamentMessage(this.db, {
      tournamentId: id,
      userId,
      username,
      body: prepared.text,
      staff: !!opts.staff,
      filtered: prepared.filtered,
      createdAt: new Date(now),
    });
    e.chat.push(row);
    if (e.chat.length > CHAT_KEEP) e.chat.splice(0, e.chat.length - CHAT_KEEP);
    this.bridge?.chatEvent?.(id, { kind: 'posted', message: this.chatView(row, false) });
    return this.chatView(row, !!opts.staff);
  }

  /** Staff hide (or show again) a chat message. */
  async hideChat(id: string, messageId: string, hidden: boolean, by: string): Promise<TournamentChatMessage> {
    const e = this.get(id);
    const m = e.chat.find((x) => x.id === messageId);
    if (!m) throw new TournamentError(404, 'No such message');
    m.hiddenAt = hidden ? new Date(this.now()) : null;
    m.hiddenBy = hidden ? by : null;
    await setTournamentMessageHidden(this.db, messageId, m.hiddenAt, m.hiddenBy);
    this.bridge?.chatEvent?.(id, { kind: 'hidden', messageId, hidden, ...(hidden ? {} : { message: this.chatView(m, false) }) });
    return this.chatView(m, true);
  }

  // ---------------------------------------------------------------- players

  /** Why this player may not join (or null): rating range, required games, late join, player limit. */
  private blockedReason(e: Entry, userId: string): string | null {
    const existing = e.players.get(userId);
    if (existing?.disqualified) return 'You were removed from this tournament';
    if (e.row.status === 'finished' || e.row.status === 'cancelled') return 'This tournament is over';
    if (!this.invitedTo(e, userId)) return PRIVATE_TOURNAMENT_BLOCKED;
    if (existing) return null; // rejoining after a pause
    if (e.row.status === 'running' && !e.row.lateJoin) return 'Late joining is closed for this tournament';
    const active = [...e.players.values()].filter((p) => this.active(p)).length;
    if (e.row.maxPlayers && active >= e.row.maxPlayers) return 'This tournament is full';
    const r = this.bridge?.rating(userId, { initialMs: e.row.initialMs, incrementMs: e.row.incrementMs });
    if (r) {
      if (e.row.minRating !== null && r.rating < e.row.minRating) return `Your rating must be at least ${e.row.minRating}`;
      if (e.row.maxRating !== null && r.rating > e.row.maxRating) return `Your rating must be at most ${e.row.maxRating}`;
      if (r.games < e.row.minRatedGames) return `Play at least ${e.row.minRatedGames} rated games in this speed first`;
    }
    return null;
  }

  private async addPlayer(e: Entry, userId: string, opts: { paid: boolean }): Promise<Player> {
    const existing = e.players.get(userId);
    const now = this.now();
    if (existing) {
      existing.withdrawn = false;
      existing.freeSince = 0;
      existing.rulesAcceptedAt = existing.rulesAcceptedAt ?? now;
      existing.paid = existing.paid || opts.paid;
      this.persistPlayer(e.row.id, existing);
      return existing;
    }
    const u = await getUser(this.db, userId);
    if (!u || u.closedAt) throw new TournamentError(403, 'Sign in with an open account to join');
    const p: Player = {
      userId,
      username: u.displayName || u.username,
      rating: Math.round(this.bridge?.rating(userId, { initialMs: e.row.initialMs, incrementMs: e.row.incrementMs }).rating ?? 1500),
      score: 0,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      streak: 0,
      drawRun: 0,
      lossRun: 0,
      opponents: [],
      colors: [],
      byes: 0,
      withdrawn: false,
      disqualified: false,
      paid: opts.paid,
      rulesAcceptedAt: now,
      joinedAt: now,
    };
    e.players.set(userId, p);
    this.persistPlayer(e.row.id, p);
    return p;
  }

  /** Joins a free tournament (or rejoins after a pause). The rules must be accepted. */
  async join(userId: string, id: string, input: { acceptRules?: unknown } = {}): Promise<TournamentDetail> {
    const e = this.get(id);
    const blocked = this.blockedReason(e, userId);
    if (blocked) throw new TournamentError(409, blocked);
    const existing = e.players.get(userId);
    if (input.acceptRules !== true && !existing?.rulesAcceptedAt) throw new TournamentError(400, 'Accept the tournament rules to join');
    if (e.row.entryFeeCents > 0 && !existing?.paid) throw new TournamentError(402, 'This tournament has an entry fee: register and pay on the web');
    await this.addPlayer(e, userId, { paid: existing?.paid ?? false });
    return this.detail(userId, id);
  }

  /**
   * Starts paying the entry fee with Stripe Checkout. Returns the page to send
   * the player to; the webhook confirms the payment and adds them.
   */
  async checkout(userId: string, id: string, input: { acceptRules?: unknown; returnUrl?: unknown }): Promise<{ url: string }> {
    const e = this.get(id);
    if (!this.stripe) throw new TournamentError(503, 'Payments are not set up yet');
    if (e.row.entryFeeCents <= 0) throw new TournamentError(400, 'This tournament is free');
    const blocked = this.blockedReason(e, userId);
    if (blocked) throw new TournamentError(409, blocked);
    if (e.players.get(userId)?.paid) throw new TournamentError(409, 'You have already paid for this tournament');
    if (input.acceptRules !== true) throw new TournamentError(400, 'Accept the tournament rules to join');
    const u = await getUser(this.db, userId);
    if (!u || u.closedAt) throw new TournamentError(403, 'Sign in with an open account to join');
    const base = typeof input.returnUrl === 'string' && /^https?:\/\//.test(input.returnUrl) ? input.returnUrl.replace(/[?#].*$/, '') : `${process.env.APP_WEB_URL ?? 'http://localhost:8081'}/tournaments/${id}`;
    const session = await this.stripe.createCheckout({
      amountCents: e.row.entryFeeCents,
      currency: e.row.currency,
      productName: `${e.row.name}: entry`,
      customerEmail: u.email ?? undefined,
      successUrl: `${base}?paid=1`,
      cancelUrl: `${base}?paid=0`,
      metadata: { tournamentId: id, userId },
    });
    await insertPayment(this.db, { tournamentId: id, userId, stripeSessionId: session.id, amountCents: e.row.entryFeeCents, currency: e.row.currency, status: 'pending' });
    return { url: session.url };
  }

  /** Stripe said a checkout session was paid: record it and add the player. Safe to call twice. */
  async paymentCompleted(sessionId: string): Promise<void> {
    const pay = await paymentBySession(this.db, sessionId);
    if (!pay || pay.status === 'paid') return;
    await setPaymentStatus(this.db, sessionId, 'paid', new Date(this.now()));
    const e = this.entries.get(pay.tournamentId);
    if (!e) return;
    // Taken off the invite list while paying: record the payment, but they do not play (staff refund it).
    if (!this.invitedTo(e, pay.userId)) {
      console.warn(`paid entry from ${pay.userId} for private tournament ${e.row.id}, but they are no longer invited`);
      return;
    }
    const p = await this.addPlayer(e, pay.userId, { paid: true });
    p.paid = true;
    this.persistPlayer(e.row.id, p);
    this.bridge?.notify(pay.userId, `You are in: ${e.row.name}`, `Entry fee of ${formatMoney(pay.amountCents, pay.currency)} received. Good luck!`, `/tournaments/${e.row.id}`);
  }

  async paymentExpired(sessionId: string): Promise<void> {
    const pay = await paymentBySession(this.db, sessionId);
    if (pay && pay.status === 'pending') await setPaymentStatus(this.db, sessionId, 'expired', null);
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

  /** A prize winner asks to be paid; staff review it and get in touch. */
  async requestPayout(userId: string, id: string, input: unknown): Promise<TournamentDetail> {
    const e = this.get(id);
    if (e.row.status !== 'finished') throw new TournamentError(409, 'Payouts open when the tournament has finished');
    const place = this.prizePlaceOf(e, userId);
    const prize = (e.row.prizes ?? []).find((p) => p.place === place);
    if (!place || !prize) throw new TournamentError(403, 'Only prize winners can request a payout');
    if (this.payouts.has(`${id}:${userId}`)) throw new TournamentError(409, 'You have already requested this payout');
    const v = validatePayoutRequest(input);
    if ('error' in v) throw new TournamentError(400, v.error);
    const row = await insertPayoutRequest(this.db, {
      tournamentId: id,
      userId,
      username: e.players.get(userId)?.username ?? userId,
      place,
      prize: prize.prize,
      method: v.value.method,
      details: v.value.details,
      note: v.value.note,
      status: 'new',
      createdAt: new Date(this.now()),
    });
    this.payouts.set(`${id}:${userId}`, row);
    return this.detail(userId, id);
  }

  private prizePlaceOf(e: Entry, userId: string): number | null {
    if (e.row.status !== 'finished') return null;
    const s = this.standings(e).find((x) => x.userId === userId);
    if (!s || s.games === 0) return null;
    return (e.row.prizes ?? []).some((p) => p.place === s.rank) ? s.rank : null;
  }

  // ---------------------------------------------------------------- sponsors

  /** "Sponsor a tournament": anyone (signed in or not) can apply; staff review and get in touch. */
  async applySponsor(userId: string | null, input: unknown): Promise<{ ok: true }> {
    const v = validateSponsorApplication(input);
    if ('error' in v) throw new TournamentError(400, v.error);
    await insertSponsorApplication(this.db, { ...v.value, userId, status: 'new', createdAt: new Date(this.now()) });
    return { ok: true };
  }

  // ---------------------------------------------------------------- views

  private logoPath(r: Tournament): string | null {
    if (!r.sponsorLogo) return null;
    const v = createHash('sha1').update(r.sponsorLogo).digest('hex').slice(0, 10);
    return `/api/tournaments/${encodeURIComponent(r.id)}/logo?v=${v}`;
  }

  /** The sponsor logo image, for GET /api/tournaments/:id/logo. */
  logoOf(id: string): { mime: string; bytes: Buffer } | null {
    const logo = this.entries.get(id)?.row.sponsorLogo;
    const m = logo ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(logo) : null;
    return m ? { mime: m[1]!, bytes: Buffer.from(m[2]!, 'base64') } : null;
  }

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
      entryFeeCents: r.entryFeeCents,
      currency: r.currency as TournamentCurrency,
      minRating: r.minRating,
      maxRating: r.maxRating,
      minRatedGames: r.minRatedGames,
      lateJoin: r.lateJoin,
      rules: r.rules,
      sponsor: r.sponsorName ? { name: r.sponsorName, url: r.sponsorUrl, logoPath: this.logoPath(r) } : null,
      settings: this.settings(e),
      round: r.currentRound,
      finishing: r.status === 'running' && this.endsAt(r) <= this.now(),
      players: [...e.players.values()].filter((p) => (this.active(p) || p.games > 0) && !p.disqualified).length,
      joined: !!viewer && !!e.players.get(viewer) && this.active(e.players.get(viewer)!),
      winner: r.status === 'finished' && standings[0] && standings[0].games > 0 ? standings[0].username : null,
      private: r.private,
    };
  }

  private standings(e: Entry): TournamentStanding[] {
    const playing = new Set<string>();
    for (const g of e.games.values()) playing.add(g.white).add(g.black);
    const s = this.settings(e);
    const swiss = s.format === 'swiss';
    const list = [...e.players.values()].filter((p) => !p.disqualified && (this.active(p) || p.games > 0 || p.byes > 0));
    // Swiss tie-break: Buchholz, the sum of the opponents' scores.
    const buchholz = new Map<string, number>();
    if (swiss) for (const p of list) buchholz.set(p.userId, p.opponents.reduce((sum, id) => sum + (e.players.get(id)?.score ?? 0), 0));
    list.sort(
      (a, b) =>
        b.score - a.score || (buchholz.get(b.userId) ?? 0) - (buchholz.get(a.userId) ?? 0) || b.wins - a.wins || b.rating - a.rating || a.joinedAt - b.joinedAt,
    );
    return list.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      username: p.username,
      rating: p.rating,
      score: this.shown(e, p.score),
      games: p.games,
      wins: p.wins,
      draws: p.draws,
      losses: p.losses,
      onFire: !swiss && s.winStreak && p.streak >= 2,
      ...(swiss ? { buchholz: (buchholz.get(p.userId) ?? 0) / 2, byes: p.byes } : {}),
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
    let you: TournamentViewer | null = null;
    if (viewer) {
      const p = e.players.get(viewer);
      const payout = this.payouts.get(`${id}:${viewer}`);
      you = {
        paid: !!p?.paid,
        blocked: this.summary(e, viewer).joined ? null : this.blockedReason(e, viewer),
        prizePlace: this.prizePlaceOf(e, viewer),
        payout: payout ? { status: payout.status as PayoutStatus, method: payout.method as PayoutMethod } : null,
        disqualified: !!p?.disqualified,
        invited: e.row.private && this.invitedTo(e, viewer),
      };
    }
    const games = e.results
      .filter((r) => r.result !== '*' && r.counted)
      .reverse()
      .map((r) => this.gameView(e, r));
    const invited: TournamentInvitee[] = e.row.private ? (e.row.invited ?? []).map((x) => ({ userId: x.userId, username: e.players.get(x.userId)?.username ?? x.username })) : [];
    return { ...this.summary(e, viewer), standings: this.standings(e), games, liveGames, yourGameId, you, invited };
  }

  // ---------------------------------------------------------------- staff

  /** Live monitor for staff: the detail plus every player (paid, removed, paused) and the payments. */
  async adminDetail(id: string): Promise<AdminTournamentView> {
    const e = this.get(id);
    const detail = this.detail(null, id);
    const playing = new Set<string>();
    for (const g of e.games.values()) playing.add(g.white).add(g.black);
    const payments = (await paymentsOf(this.db, id)).map((p) => ({ userId: p.userId, amountCents: p.amountCents, currency: p.currency, status: p.status, createdAt: ms(p.createdAt) }));
    return {
      ...detail,
      roster: [...e.players.values()]
        .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
        .map((p) => ({
          userId: p.userId,
          username: p.username,
          rating: p.rating,
          score: this.shown(e, p.score),
          games: p.games,
          withdrawn: p.withdrawn,
          disqualified: p.disqualified,
          paid: p.paid,
          rulesAcceptedAt: p.rulesAcceptedAt,
          joinedAt: p.joinedAt,
          playing: playing.has(p.userId),
        })),
      payments,
      revenueCents: payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amountCents, 0),
      allGames: [...e.results].reverse().map((r) => this.gameView(e, r)),
      chat: e.chat.map((m) => this.chatView(m, true)),
    };
  }

  /** Staff remove a player: no more pairings, off the standings, cannot rejoin. */
  disqualify(id: string, userId: string): AdminTournamentView['roster'][number] {
    const e = this.get(id);
    const p = e.players.get(userId);
    if (!p) throw new TournamentError(404, 'This player is not in the tournament');
    p.disqualified = true;
    p.withdrawn = true;
    this.persistPlayer(id, p);
    this.bridge?.notify(userId, `Removed from ${e.row.name}`, 'Tournament staff removed you from this tournament.', `/tournaments/${id}`);
    return { userId: p.userId, username: p.username, rating: p.rating, score: this.shown(e, p.score), games: p.games, withdrawn: p.withdrawn, disqualified: true, paid: p.paid, rulesAcceptedAt: p.rulesAcceptedAt, joinedAt: p.joinedAt, playing: false };
  }

  async create(input: unknown, createdBy: string): Promise<TournamentDetail> {
    const v = validateTournamentInput(input, this.now());
    if ('error' in v) throw new TournamentError(400, v.error);
    if (v.value.entryFeeCents > 0 && !this.stripe) throw new TournamentError(400, 'Set up Stripe (STRIPE_SECRET_KEY) before charging entry fees');
    const invited = await this.resolveInvites(v.value);
    const row = await insertTournament(this.db, {
      id: randomUUID().slice(0, 10),
      ...this.columns(v.value),
      invited,
      sponsorLogo: v.value.sponsorLogo ?? null,
      status: 'scheduled',
      createdBy,
    });
    const e: Entry = { row, players: new Map(), games: new Map(), roundDoneAt: 0, results: [], chat: [] };
    this.entries.set(row.id, e);
    this.notifyInvited(e, invited);
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
      entryFeeCents: v.entryFeeCents,
      currency: v.currency,
      minRating: v.minRating,
      maxRating: v.maxRating,
      minRatedGames: v.minRatedGames,
      lateJoin: v.lateJoin,
      rules: v.rules,
      sponsorName: v.sponsorName,
      sponsorUrl: v.sponsorUrl,
      settings: { ...v.settings } as Record<string, unknown>,
      private: v.private,
    };
  }

  /** Looks up a private tournament's invited usernames; every one must be an open account. */
  private async resolveInvites(v: TournamentInput, current: TournamentInvitee[] = []): Promise<TournamentInvitee[]> {
    if (!v.private) return [];
    const out: TournamentInvitee[] = [];
    const missing: string[] = [];
    for (const name of v.invited) {
      const known = current.find((x) => x.username.toLowerCase() === name.toLowerCase());
      const u = await findUserByUsername(this.db, name);
      if (u && !u.closedAt && !u.deletedAt) {
        if (!out.some((x) => x.userId === u.id)) out.push({ userId: u.id, username: u.username });
      } else if (known) out.push(known);
      else missing.push(name);
    }
    if (missing.length) throw new TournamentError(400, missing.length === 1 ? `No player named ${missing[0]}` : `No players named ${missing.join(', ')}`);
    return out;
  }

  /** Tells newly invited players about a private tournament. */
  private notifyInvited(e: Entry, invitees: TournamentInvitee[]) {
    if (!e.row.private || e.row.status === 'finished' || e.row.status === 'cancelled') return;
    for (const x of invitees) this.bridge?.notify(x.userId, `You are invited to ${e.row.name}`, 'Open the tournament to join.', `/tournaments/${e.row.id}`);
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
      entryFeeCents: row.entryFeeCents,
      currency: row.currency as TournamentCurrency,
      minRating: row.minRating,
      maxRating: row.maxRating,
      minRatedGames: row.minRatedGames,
      lateJoin: row.lateJoin,
      rules: row.rules,
      sponsorName: row.sponsorName,
      sponsorUrl: row.sponsorUrl,
      settings: tournamentSettings(row.settings),
      private: row.private,
      invited: (row.invited ?? []).map((x) => x.username),
    };
  }

  /**
   * Edits a tournament. Time control, start, rating, fee and entry limits can
   * only change before it starts; prizes, sponsor and texts any time.
   */
  async update(id: string, input: unknown): Promise<TournamentDetail> {
    const e = this.get(id);
    if (e.row.status === 'cancelled') throw new TournamentError(409, 'This tournament was cancelled');
    const v = validateTournamentInput(input, this.now(), this.inputOf(e.row));
    if ('error' in v) throw new TournamentError(400, v.error);
    if (v.value.entryFeeCents > 0 && !this.stripe) throw new TournamentError(400, 'Set up Stripe (STRIPE_SECRET_KEY) before charging entry fees');
    let cols: ReturnType<TournamentService['columns']> & { sponsorLogo?: string | null } = this.columns(v.value);
    if (e.row.status !== 'scheduled') {
      // Running or finished: keep the clock, the schedule and what players signed up for.
      cols = {
        ...cols,
        initialMs: e.row.initialMs,
        incrementMs: e.row.incrementMs,
        rated: e.row.rated,
        startsAt: new Date(e.row.startsAt),
        entryFeeCents: e.row.entryFeeCents,
        currency: e.row.currency as TournamentCurrency,
        minRating: e.row.minRating,
        maxRating: e.row.maxRating,
        minRatedGames: e.row.minRatedGames,
        // Format and scoring are what players signed up for.
        settings: e.row.settings,
        // Open or invite-only is too; the invite list itself can still change.
        private: e.row.private,
      };
    }
    if (v.value.sponsorLogo !== undefined) cols.sponsorLogo = v.value.sponsorLogo;
    const before = e.row.invited ?? [];
    // A started private tournament stays private: without a new list, keep the old one.
    const invited = !cols.private ? [] : v.value.private ? await this.resolveInvites(v.value, before) : before;
    await updateTournament(this.db, id, { ...cols, invited });
    e.row = { ...e.row, ...cols, invited };
    this.notifyInvited(e, invited.filter((x) => !before.some((b) => b.userId === x.userId)));
    // Taken off the list: they stop being paired (points so far are kept).
    for (const p of e.players.values()) {
      if (this.active(p) && !this.invitedTo(e, p.userId)) {
        p.withdrawn = true;
        this.persistPlayer(id, p);
      }
    }
    return this.detail(null, id);
  }

  cancel(id: string): TournamentDetail {
    const e = this.get(id);
    if (e.row.status === 'finished' || e.row.status === 'cancelled') throw new TournamentError(409, 'This tournament is already over');
    this.setStatus(e, 'cancelled');
    for (const p of e.players.values()) {
      if (!this.active(p)) continue;
      const refund = p.paid ? ' Your entry fee will be refunded.' : '';
      this.bridge?.notify(p.userId, `${e.row.name} was cancelled`, `The tournament will not take place.${refund}`, `/tournaments/${id}`);
    }
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

  async sponsorApplications(): Promise<SponsorApplicationView[]> {
    return (await listSponsorApplications(this.db)).map(toSponsorView);
  }

  async reviewSponsor(id: string, input: { status?: unknown; note?: unknown }, by: string): Promise<SponsorApplicationView> {
    if (!(SPONSOR_STATUSES as readonly unknown[]).includes(input.status)) throw new TournamentError(400, 'Pick a status');
    const row = await updateSponsorApplication(this.db, id, {
      status: input.status as SponsorStatus,
      staffNote: typeof input.note === 'string' ? input.note.trim().slice(0, 1000) || null : undefined,
      reviewedBy: by,
      updatedAt: new Date(this.now()),
    });
    if (!row) throw new TournamentError(404, 'No such application');
    return toSponsorView(row);
  }

  /**
   * Marks a sponsor application as waiting for material (the title, text,
   * image and link). The email itself is sent by the admin service, which owns
   * the mailer; this only records that it was asked for.
   */
  async requestSponsorMaterial(id: string, by: string): Promise<SponsorApplicationView> {
    const row = await updateSponsorApplication(this.db, id, {
      status: 'material',
      reviewedBy: by,
      materialRequestedAt: new Date(this.now()),
      updatedAt: new Date(this.now()),
    });
    if (!row) throw new TournamentError(404, 'No such application');
    return toSponsorView(row);
  }

  payoutRequests(): PayoutRequestView[] {
    return [...this.payouts.values()]
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
      .map((r) => toPayoutView(r, this.entries.get(r.tournamentId)?.row.name ?? r.tournamentId));
  }

  async reviewPayout(id: string, input: { status?: unknown; note?: unknown }, by: string): Promise<PayoutRequestView> {
    if (!(PAYOUT_STATUSES as readonly unknown[]).includes(input.status)) throw new TournamentError(400, 'Pick a status');
    const row = await updatePayoutRequest(this.db, id, {
      status: input.status as PayoutStatus,
      staffNote: typeof input.note === 'string' ? input.note.trim().slice(0, 1000) || null : undefined,
      reviewedBy: by,
      updatedAt: new Date(this.now()),
    });
    if (!row) throw new TournamentError(404, 'No such payout request');
    this.payouts.set(`${row.tournamentId}:${row.userId}`, row);
    const name = this.entries.get(row.tournamentId)?.row.name ?? 'the tournament';
    const text: Record<string, string> = {
      contacted: 'Our team will contact you about your prize.',
      paid: `Your prize (${row.prize}) has been paid.`,
      rejected: 'Your payout request was declined. Check your messages or contact support.',
    };
    if (text[row.status]) this.bridge?.notify(row.userId, `Prize from ${name}`, text[row.status]!, `/tournaments/${row.tournamentId}`);
    return toPayoutView(row, name);
  }

  /** Whether a game belongs to a tournament (for the game screen). */
  tournamentOfGame(gameId: string): string | null {
    for (const e of this.entries.values()) if (e.games.has(gameId)) return e.row.id;
    return null;
  }
}

function toSponsorView(r: SponsorApplication): SponsorApplicationView {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    email: r.email,
    company: r.company,
    website: r.website,
    budget: r.budget,
    message: r.message,
    spot: isAdSpot(r.spot) ? r.spot : null,
    status: r.status as SponsorStatus,
    staffNote: r.staffNote,
    reviewedBy: r.reviewedBy,
    createdAt: ms(r.createdAt),
    materialRequestedAt: r.materialRequestedAt ? ms(r.materialRequestedAt) : null,
  };
}

function toPayoutView(r: PayoutRequest, tournamentName: string): PayoutRequestView {
  return {
    id: r.id,
    tournamentId: r.tournamentId,
    tournamentName,
    userId: r.userId,
    username: r.username,
    place: r.place,
    prize: r.prize,
    method: r.method as PayoutMethod,
    details: r.details,
    note: r.note,
    status: r.status as PayoutStatus,
    staffNote: r.staffNote,
    reviewedBy: r.reviewedBy,
    createdAt: ms(r.createdAt),
  };
}
