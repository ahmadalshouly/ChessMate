import type { AwardedPrize, EntrantStatus, PrizePool, Side, TournamentFormat, TournamentResult, TournamentStatus } from '@chessmate/core';
import { deleteTournamentPlayer, loadTournaments, saveTournament, saveTournamentGame, saveTournamentPlayer, type Database } from '@chessmate/db';
import type { Entry, TGame, Tournament, TournamentStore } from './service';

const ms = (d: Date | null) => (d ? d.getTime() : null);
const date = (n: number | null) => (n === null ? null : new Date(n));

/** Tournaments in Postgres, written through in order (same pattern as the fair-play store). */
export class DbTournamentStore implements TournamentStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: Database,
    private readonly log = (msg: string, e: unknown) => console.error(`[tournaments] ${msg}`, e),
  ) {}

  private write(label: string, fn: () => Promise<unknown>) {
    this.tail = this.tail.then(fn).catch((e) => this.log(`${label} failed`, e));
  }

  flush() {
    return this.tail.then(() => undefined);
  }

  async load(): Promise<Tournament[]> {
    return (await loadTournaments(this.db)).map(({ tournament: r, players, games }) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      format: r.format as TournamentFormat,
      timeControl: { initialMs: r.initialMs, incrementMs: r.incrementMs },
      rated: r.rated,
      startsAt: r.startsAt.getTime(),
      durationMinutes: r.durationMinutes,
      rounds: r.rounds,
      maxPlayers: r.maxPlayers,
      minRating: r.minRating,
      maxRating: r.maxRating,
      prizePool: (r.prizePool as PrizePool | null) ?? null,
      status: r.status as TournamentStatus,
      currentRound: r.currentRound,
      cancelReason: r.cancelReason,
      reminded: r.reminded,
      winnerId: r.winnerId,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: r.createdAt.getTime(),
      startedAt: ms(r.startedAt),
      endedAt: ms(r.endedAt),
      roundDoneAt: null,
      players: new Map(
        players.map((p): [string, Entry] => [
          p.userId,
          {
            userId: p.userId,
            username: p.username,
            rating: p.rating,
            score: p.score,
            games: p.games,
            wins: p.wins,
            draws: p.draws,
            losses: p.losses,
            streak: p.streak,
            colorBalance: p.colorBalance,
            lastColor: (p.lastColor as Side | null) ?? null,
            hadBye: p.hadBye,
            opponents: p.opponents,
            status: p.status as EntrantStatus,
            prize: (p.prize as AwardedPrize | null) ?? null,
            joinedAt: p.joinedAt.getTime(),
            playing: null,
            freeSince: 0,
          },
        ]),
      ),
      games: new Map(
        games.map((g): [string, TGame] => [
          g.gameId,
          {
            gameId: g.gameId,
            round: g.round,
            white: { id: g.whiteId, username: g.whiteName, rating: g.whiteRating },
            black: g.blackId ? { id: g.blackId, username: g.blackName ?? '', rating: g.blackRating ?? 0 } : null,
            result: g.result as TournamentResult,
            startedAt: g.startedAt.getTime(),
            endedAt: ms(g.endedAt),
          },
        ]),
      ),
    }));
  }

  saveTournament(t: Tournament) {
    const row = {
      id: t.id,
      name: t.name,
      description: t.description,
      format: t.format,
      initialMs: t.timeControl.initialMs,
      incrementMs: t.timeControl.incrementMs,
      rated: t.rated,
      startsAt: new Date(t.startsAt),
      durationMinutes: t.durationMinutes,
      rounds: t.rounds,
      maxPlayers: t.maxPlayers,
      minRating: t.minRating,
      maxRating: t.maxRating,
      prizePool: t.prizePool as unknown as Record<string, unknown> | null,
      status: t.status,
      currentRound: t.currentRound,
      cancelReason: t.cancelReason,
      reminded: t.reminded,
      winnerId: t.winnerId,
      createdBy: t.createdBy,
      createdByName: t.createdByName,
      startedAt: date(t.startedAt),
      endedAt: date(t.endedAt),
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(),
    };
    this.write(`save tournament ${t.id}`, () => saveTournament(this.db, row));
  }

  savePlayer(tournamentId: string, e: Entry) {
    const row = {
      tournamentId,
      userId: e.userId,
      username: e.username,
      rating: e.rating,
      score: e.score,
      games: e.games,
      wins: e.wins,
      draws: e.draws,
      losses: e.losses,
      streak: e.streak,
      colorBalance: e.colorBalance,
      lastColor: e.lastColor,
      hadBye: e.hadBye,
      opponents: [...e.opponents],
      status: e.status,
      prize: e.prize as unknown as Record<string, unknown> | null,
      joinedAt: new Date(e.joinedAt),
    };
    this.write(`save entry ${tournamentId}/${e.userId}`, () => saveTournamentPlayer(this.db, row));
  }

  deletePlayer(tournamentId: string, userId: string) {
    this.write(`delete entry ${tournamentId}/${userId}`, () => deleteTournamentPlayer(this.db, tournamentId, userId));
  }

  saveGame(tournamentId: string, g: TGame) {
    const row = {
      tournamentId,
      gameId: g.gameId,
      round: g.round,
      whiteId: g.white.id,
      whiteName: g.white.username,
      whiteRating: g.white.rating,
      blackId: g.black?.id ?? null,
      blackName: g.black?.username ?? null,
      blackRating: g.black?.rating ?? null,
      result: g.result,
      startedAt: new Date(g.startedAt),
      endedAt: date(g.endedAt),
    };
    this.write(`save game ${tournamentId}/${g.gameId}`, () => saveTournamentGame(this.db, row));
  }
}
