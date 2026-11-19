import type { TimeControl } from './timeControl';

/**
 * Arena tournaments: staff create and schedule them; players join. While a
 * tournament runs, the server pairs waiting players (similar scores first) as
 * soon as they finish a game, until the time is up. Most points wins.
 *
 * Points: win 2, draw 1, loss 0. After two wins in a row a player is "on
 * fire": wins and draws count double until they fail to win.
 */
export type TournamentStatus = 'scheduled' | 'running' | 'finished' | 'cancelled';

export interface TournamentPrize {
  place: number;
  prize: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  description: string | null;
  status: TournamentStatus;
  timeControl: TimeControl;
  rated: boolean;
  startsAt: number;
  durationMinutes: number;
  endsAt: number;
  maxPlayers: number | null;
  prizePool: string | null;
  prizes: TournamentPrize[];
  players: number;
  /** Signed-in viewer has joined (and not withdrawn). */
  joined: boolean;
  /** Leader once finished. */
  winner: string | null;
}

export interface TournamentStanding {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Two or more wins in a row: the next win or draw counts double. */
  onFire: boolean;
  withdrawn: boolean;
  /** In a tournament game right now. */
  playing: boolean;
}

export interface TournamentDetail extends TournamentSummary {
  standings: TournamentStanding[];
  /** Games of this tournament being played right now. */
  liveGames: { gameId: string; white: string; black: string }[];
  /** The viewer's live tournament game, if any. */
  yourGameId: string | null;
}

export interface TournamentInput {
  name: string;
  description: string | null;
  timeControl: TimeControl;
  rated: boolean;
  startsAt: number;
  durationMinutes: number;
  maxPlayers: number | null;
  prizePool: string | null;
  prizes: TournamentPrize[];
}

export const TOURNAMENT_LIMITS = { nameMax: 60, descriptionMax: 600, prizeMax: 80, places: 10, minMinutes: 10, maxMinutes: 600 } as const;

/** Points for one result, given the player's current win streak. */
export function arenaPoints(result: 'win' | 'draw' | 'loss', streak: number): number {
  const base = result === 'win' ? 2 : result === 'draw' ? 1 : 0;
  return streak >= 2 ? base * 2 : base;
}

/** Validates staff input for a new or edited tournament. `partial` allows missing fields (edits). */
export function validateTournamentInput(
  input: unknown,
  now: number,
  base?: TournamentInput,
): { value: TournamentInput } | { error: string; field: string } {
  if (!input || typeof input !== 'object') return { error: 'Expected an object', field: 'body' };
  const i = input as Record<string, unknown>;
  const pick = <K extends keyof TournamentInput>(k: K): unknown => (i[k] === undefined && base ? base[k] : i[k]);

  const name = typeof pick('name') === 'string' ? (pick('name') as string).trim() : '';
  if (name.length < 3 || name.length > TOURNAMENT_LIMITS.nameMax) return { error: `Name must be 3 to ${TOURNAMENT_LIMITS.nameMax} characters`, field: 'name' };

  const d = pick('description');
  const description = typeof d === 'string' && d.trim() ? d.trim().slice(0, TOURNAMENT_LIMITS.descriptionMax) : null;

  const tc = pick('timeControl') as Record<string, unknown> | undefined;
  const initialMs = Number(tc?.initialMs);
  const incrementMs = Number(tc?.incrementMs);
  if (!Number.isFinite(initialMs) || !Number.isFinite(incrementMs) || initialMs < 30_000 || initialMs > 3 * 3600_000 || incrementMs < 0 || incrementMs > 180_000) {
    return { error: 'Choose a time control between ½ minute and 3 hours', field: 'timeControl' };
  }

  const startsAt = Number(pick('startsAt'));
  if (!Number.isFinite(startsAt)) return { error: 'Choose when it starts', field: 'startsAt' };
  if (!base && startsAt < now - 60_000) return { error: 'The start time is in the past', field: 'startsAt' };

  const durationMinutes = Math.round(Number(pick('durationMinutes')));
  if (!Number.isFinite(durationMinutes) || durationMinutes < TOURNAMENT_LIMITS.minMinutes || durationMinutes > TOURNAMENT_LIMITS.maxMinutes) {
    return { error: `Length must be ${TOURNAMENT_LIMITS.minMinutes} to ${TOURNAMENT_LIMITS.maxMinutes} minutes`, field: 'durationMinutes' };
  }

  const mp = pick('maxPlayers');
  const maxPlayers = mp === null || mp === undefined || mp === '' ? null : Math.round(Number(mp));
  if (maxPlayers !== null && (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 10_000)) return { error: 'Player limit must be 2 to 10000, or empty', field: 'maxPlayers' };

  const pp = pick('prizePool');
  const prizePool = typeof pp === 'string' && pp.trim() ? pp.trim().slice(0, TOURNAMENT_LIMITS.prizeMax) : null;

  const rawPrizes = pick('prizes');
  const prizes: TournamentPrize[] = [];
  if (Array.isArray(rawPrizes)) {
    for (const p of rawPrizes) {
      const place = Math.round(Number((p as TournamentPrize)?.place));
      const prize = typeof (p as TournamentPrize)?.prize === 'string' ? (p as TournamentPrize).prize.trim().slice(0, TOURNAMENT_LIMITS.prizeMax) : '';
      if (!prize) continue;
      if (!Number.isFinite(place) || place < 1 || place > 100) return { error: 'Prize places must be 1 to 100', field: 'prizes' };
      if (prizes.some((x) => x.place === place)) return { error: `Place ${place} has two prizes`, field: 'prizes' };
      prizes.push({ place, prize });
    }
  }
  if (prizes.length > TOURNAMENT_LIMITS.places) return { error: `At most ${TOURNAMENT_LIMITS.places} prizes`, field: 'prizes' };
  prizes.sort((a, b) => a.place - b.place);

  return {
    value: {
      name,
      description,
      timeControl: { initialMs, incrementMs },
      rated: pick('rated') !== false,
      startsAt,
      durationMinutes,
      maxPlayers,
      prizePool,
      prizes,
    },
  };
}
