import { timeCategory, type TimeControl } from './timeControl';

/**
 * Tournaments, shared by the server (/api/tournaments, /api/admin/tournaments)
 * and the app.
 *
 * Staff create and schedule tournaments and set their prize pools; players
 * join, leave and play. Two formats:
 *
 * - **Arena**: a fixed time window. Players are paired again as soon as their
 *   game ends, against someone near them in the standings. Win 2, draw 1,
 *   loss 0; after two wins in a row a player is "on fire" and scores double
 *   (win 4, draw 2) until they stop winning.
 * - **Swiss**: a fixed number of rounds. Everyone plays each round against an
 *   opponent on a similar score they have not met yet. Win 1, draw ½, loss 0;
 *   an odd player out gets a bye worth 1. Ties are split by Buchholz (the sum
 *   of the opponents' scores).
 *
 * Prize pools are records only: they are shown to players and assigned to the
 * final places, and staff mark each prize paid once they have paid it outside
 * the app.
 */

export const TOURNAMENT_FORMATS = ['arena', 'swiss'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const TOURNAMENT_STATUSES = ['scheduled', 'running', 'finished', 'cancelled'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/** active: paired; paused: arena player taking a break; withdrawn: left a swiss; removed: taken out by staff. */
export type EntrantStatus = 'active' | 'paused' | 'withdrawn' | 'removed';

/**
 * '+-' / '-+': won or lost by forfeit (the other side never moved).
 * 'void': did not count (staff ended it, the tournament was cancelled, or the server restarted mid-game).
 */
export type TournamentResult = '1-0' | '0-1' | '1/2-1/2' | '+-' | '-+' | 'bye' | 'void' | '*';

export const TOURNAMENT_LIMITS = {
  nameMin: 3,
  nameMax: 60,
  descriptionMax: 1000,
  minDurationMinutes: 10,
  maxDurationMinutes: 12 * 60,
  minRounds: 1,
  maxRounds: 15,
  minPlayers: 2,
  maxPlayers: 1000,
  maxPrizePlaces: 20,
  maxPrizeAmount: 10_000_000,
  /** How far ahead a tournament can be scheduled. */
  maxDaysAhead: 365,
  minInitialMs: 30_000,
  maxInitialMs: 3 * 3600_000,
  maxIncrementMs: 180_000,
} as const;

/** Seconds between swiss rounds, so players can look at their result. */
export const SWISS_ROUND_BREAK_MS = 15_000;
/** Arena players wait this long after a game before the next pairing. */
export const ARENA_REPAIR_DELAY_MS = 3_000;
/** Registered players are reminded this long before the start. */
export const TOURNAMENT_REMINDER_MS = 5 * 60_000;

export interface PrizePlace {
  /** 1 = winner. */
  place: number;
  amount: number;
  /** Optional extra, e.g. "Trophy + coaching session". */
  label: string | null;
}

export interface PrizePool {
  /** ISO 4217 code, e.g. USD. */
  currency: string;
  places: PrizePlace[];
  /** Shown under the prizes, e.g. who sponsors them or how they are paid. */
  note: string | null;
}

export interface AwardedPrize {
  place: number;
  amount: number;
  currency: string;
  label: string | null;
  /** Set by staff once the prize has been paid outside the app. */
  paidAt: number | null;
}

/** What staff send to create or edit a tournament. */
export interface TournamentSettings {
  name: string;
  description: string;
  format: TournamentFormat;
  timeControl: TimeControl;
  rated: boolean;
  startsAt: number;
  /** Arena only. */
  durationMinutes: number | null;
  /** Swiss only. */
  rounds: number | null;
  maxPlayers: number | null;
  minRating: number | null;
  maxRating: number | null;
  prizePool: PrizePool | null;
}

export interface TournamentPlayerRef {
  id: string;
  username: string;
  rating: number;
}

export interface TournamentSummary {
  id: string;
  name: string;
  description: string;
  format: TournamentFormat;
  timeControl: TimeControl;
  rated: boolean;
  status: TournamentStatus;
  startsAt: number;
  /** Arena: start + duration. Swiss: null until it finishes. */
  endsAt: number | null;
  durationMinutes: number | null;
  rounds: number | null;
  currentRound: number;
  players: number;
  maxPlayers: number | null;
  minRating: number | null;
  maxRating: number | null;
  prizePool: PrizePool | null;
  winner: { id: string; username: string } | null;
  startedAt: number | null;
  endedAt: number | null;
  /** Whether the viewer is registered (any status but removed). */
  joined: boolean;
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
  /** Arena: consecutive wins (2+ means double points). */
  streak: number;
  /** Swiss tie-break. */
  buchholz: number;
  status: EntrantStatus;
  prize: AwardedPrize | null;
  /** Live game in this tournament, if any. */
  playingGameId: string | null;
}

export interface TournamentPairing {
  gameId: string;
  round: number;
  white: TournamentPlayerRef;
  /** Null for a bye. */
  black: TournamentPlayerRef | null;
  result: TournamentResult;
  startedAt: number;
}

export type JoinBlock = 'signed_out' | 'guest' | 'closed' | 'full' | 'rating_low' | 'rating_high' | 'finished' | 'last_round' | 'removed';

export interface TournamentViewerState {
  status: EntrantStatus | null;
  rank: number | null;
  /** The viewer's live tournament game. */
  gameId: string | null;
  canJoin: boolean;
  /** Why the viewer cannot join, when they cannot. */
  joinBlock: JoinBlock | null;
  rating: number | null;
}

export interface TournamentDetail extends TournamentSummary {
  standings: TournamentStanding[];
  /** Newest first, at most 60. */
  pairings: TournamentPairing[];
  cancelReason: string | null;
  me: TournamentViewerState | null;
  /** Swiss: when the next round is paired, during the break between rounds. */
  nextRoundAt: number | null;
}

/** Staff view adds who created it. */
export interface AdminTournament extends TournamentDetail {
  createdBy: string;
  createdAt: number;
  prizesPaid: number;
  prizesAwarded: number;
}

/** GET /api/tournaments */
export interface TournamentList {
  live: TournamentSummary[];
  upcoming: TournamentSummary[];
  finished: TournamentSummary[];
}

/** Tournament data attached to a live game, so the game screen can link back. */
export interface GameTournamentRef {
  id: string;
  name: string;
  round: number;
}

// ---------------------------------------------------------------- validation

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const optInt = (v: unknown) => v === null || v === undefined || v === '';

export type ValidationResult<T> = { value: T } | { error: string; field: string };

export function prizeTotal(pool: PrizePool | null | undefined): number {
  return pool ? pool.places.reduce((s, p) => s + p.amount, 0) : 0;
}

export function validatePrizePool(raw: unknown): ValidationResult<PrizePool | null> {
  if (raw === null || raw === undefined) return { value: null };
  if (!isObj(raw)) return { error: 'Invalid prize pool', field: 'prizePool' };
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Use a 3-letter currency code such as USD', field: 'prizePool.currency' };
  if (!Array.isArray(raw.places)) return { error: 'Add at least one prize', field: 'prizePool.places' };
  if (raw.places.length > TOURNAMENT_LIMITS.maxPrizePlaces) return { error: `At most ${TOURNAMENT_LIMITS.maxPrizePlaces} prizes`, field: 'prizePool.places' };
  const places: PrizePlace[] = [];
  for (const p of raw.places) {
    if (!isObj(p)) return { error: 'Invalid prize', field: 'prizePool.places' };
    const amount = typeof p.amount === 'number' ? Math.round(p.amount * 100) / 100 : NaN;
    if (!intIn(p.place, 1, TOURNAMENT_LIMITS.maxPlayers)) return { error: 'Each prize needs a place (1, 2, 3...)', field: 'prizePool.places' };
    if (!(amount >= 0 && amount <= TOURNAMENT_LIMITS.maxPrizeAmount)) return { error: 'Prize amounts must be 0 or more', field: 'prizePool.places' };
    const label = typeof p.label === 'string' && p.label.trim() ? p.label.trim().slice(0, 80) : null;
    if (amount === 0 && !label) return { error: 'A prize of 0 needs a description', field: 'prizePool.places' };
    places.push({ place: p.place as number, amount, label });
  }
  if (new Set(places.map((p) => p.place)).size !== places.length) return { error: 'Each place can have one prize', field: 'prizePool.places' };
  if (places.length === 0) return { value: null };
  places.sort((a, b) => a.place - b.place);
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 300) : null;
  return { value: { currency, places, note } };
}

/**
 * Checks staff input for a new or edited tournament. `now` rejects start
 * times in the past (pass `allowPast` when editing a running tournament's
 * prizes only).
 */
export function validateTournamentSettings(raw: unknown, now: number, opts: { allowPast?: boolean } = {}): ValidationResult<TournamentSettings> {
  if (!isObj(raw)) return { error: 'Invalid tournament', field: 'name' };
  const L = TOURNAMENT_LIMITS;
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < L.nameMin || name.length > L.nameMax) return { error: `Name must be ${L.nameMin}-${L.nameMax} characters`, field: 'name' };
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, L.descriptionMax) : '';
  const format = raw.format;
  if (format !== 'arena' && format !== 'swiss') return { error: 'Choose arena or swiss', field: 'format' };
  const tc = raw.timeControl;
  if (!isObj(tc) || !intIn(tc.initialMs, L.minInitialMs, L.maxInitialMs) || !intIn(tc.incrementMs, 0, L.maxIncrementMs))
    return { error: 'Choose a time control between 0.5 and 180 minutes', field: 'timeControl' };
  const timeControl: TimeControl = { initialMs: tc.initialMs as number, incrementMs: tc.incrementMs as number };
  if (timeCategory(timeControl) === 'correspondence') return { error: 'Correspondence time controls are not available in tournaments', field: 'timeControl' };
  const startsAt = raw.startsAt;
  if (typeof startsAt !== 'number' || !Number.isFinite(startsAt)) return { error: 'Choose a start time', field: 'startsAt' };
  if (!opts.allowPast && startsAt < now - 60_000) return { error: 'The start time is in the past', field: 'startsAt' };
  if (startsAt > now + L.maxDaysAhead * 86_400_000) return { error: 'Schedule it within a year', field: 'startsAt' };
  let durationMinutes: number | null = null;
  let rounds: number | null = null;
  if (format === 'arena') {
    if (!intIn(raw.durationMinutes, L.minDurationMinutes, L.maxDurationMinutes)) return { error: `Arena length must be ${L.minDurationMinutes}-${L.maxDurationMinutes} minutes`, field: 'durationMinutes' };
    durationMinutes = raw.durationMinutes as number;
  } else {
    if (!intIn(raw.rounds, L.minRounds, L.maxRounds)) return { error: `Swiss needs ${L.minRounds}-${L.maxRounds} rounds`, field: 'rounds' };
    rounds = raw.rounds as number;
  }
  let maxPlayers: number | null = null;
  if (!optInt(raw.maxPlayers)) {
    if (!intIn(raw.maxPlayers, L.minPlayers, L.maxPlayers)) return { error: `Player limit must be ${L.minPlayers}-${L.maxPlayers}`, field: 'maxPlayers' };
    maxPlayers = raw.maxPlayers as number;
  }
  const ratingOf = (v: unknown, field: string): ValidationResult<number | null> => {
    if (optInt(v)) return { value: null };
    if (!intIn(v, 100, 3500)) return { error: 'Rating limits must be between 100 and 3500', field };
    return { value: v as number };
  };
  const min = ratingOf(raw.minRating, 'minRating');
  if ('error' in min) return min;
  const max = ratingOf(raw.maxRating, 'maxRating');
  if ('error' in max) return max;
  if (min.value !== null && max.value !== null && min.value >= max.value) return { error: 'The minimum rating must be below the maximum', field: 'minRating' };
  const pool = validatePrizePool(raw.prizePool);
  if ('error' in pool) return pool;
  return {
    value: {
      name,
      description,
      format,
      timeControl,
      rated: raw.rated !== false,
      startsAt: Math.round(startsAt),
      durationMinutes,
      rounds,
      maxPlayers,
      minRating: min.value,
      maxRating: max.value,
      prizePool: pool.value,
    },
  };
}

// ---------------------------------------------------------------- scoring

export type Side = 'w' | 'b';

/** Points for one side of a finished game, given its result. */
export function resultPoints(format: TournamentFormat, result: TournamentResult, side: Side, streakBefore: number): { points: number; streak: number; outcome: 'win' | 'draw' | 'loss' | 'none' } {
  if (result === '*' || result === 'void') return { points: 0, streak: streakBefore, outcome: 'none' };
  if (result === 'bye') return { points: format === 'swiss' ? 1 : 0, streak: streakBefore, outcome: 'none' };
  const won = (side === 'w' && (result === '1-0' || result === '+-')) || (side === 'b' && (result === '0-1' || result === '-+'));
  const draw = result === '1/2-1/2';
  const outcome = won ? 'win' : draw ? 'draw' : 'loss';
  if (format === 'swiss') return { points: won ? 1 : draw ? 0.5 : 0, streak: 0, outcome };
  const onFire = streakBefore >= 2;
  if (won) return { points: onFire ? 4 : 2, streak: streakBefore + 1, outcome };
  if (draw) return { points: onFire ? 2 : 1, streak: 0, outcome };
  return { points: 0, streak: 0, outcome };
}

export function isOnFire(streak: number): boolean {
  return streak >= 2;
}

// ---------------------------------------------------------------- pairing

export interface PairingEntrant {
  id: string;
  score: number;
  rating: number;
  /** Everyone already played, in order. */
  opponents: string[];
  /** Games with white minus games with black. */
  colorBalance: number;
  hadBye?: boolean;
  /** The colour of the last game, to avoid three in a row. */
  lastColor?: Side | null;
}

export interface PairingResult {
  pairs: [white: string, black: string][];
  bye: string | null;
}

const byStanding = (a: PairingEntrant, b: PairingEntrant) => b.score - a.score || b.rating - a.rating || (a.id < b.id ? -1 : 1);

/** Gives white to whoever had it less (then the higher seed on odd rounds). */
export function assignColors(a: PairingEntrant, b: PairingEntrant, round: number): [string, string] {
  if (a.colorBalance !== b.colorBalance) return a.colorBalance < b.colorBalance ? [a.id, b.id] : [b.id, a.id];
  if (a.lastColor && b.lastColor && a.lastColor !== b.lastColor) return a.lastColor === 'b' ? [a.id, b.id] : [b.id, a.id];
  const higher = byStanding(a, b) <= 0 ? a : b;
  const lower = higher === a ? b : a;
  return round % 2 === 1 ? [higher.id, lower.id] : [lower.id, higher.id];
}

/**
 * Swiss pairing: players sorted by score then rating, each paired with the
 * closest-ranked player they have not met (backtracking when a choice leaves
 * someone without a fresh opponent). If no pairing without repeats exists,
 * repeats are allowed. With an odd count, the lowest-ranked player who has
 * not had a bye sits out with a bye.
 */
export function pairSwiss(entrants: PairingEntrant[], round: number): PairingResult {
  const sorted = [...entrants].sort(byStanding);
  const met = (a: PairingEntrant, b: PairingEntrant) => a.opponents.includes(b.id) || b.opponents.includes(a.id);
  let budget = 50_000;
  /** Repeat-free pairing of `list` in standings order, or null. */
  const perfect = (list: PairingEntrant[]): [number, number][] | null => {
    const n = list.length;
    const used = new Array<boolean>(n).fill(false);
    const chosen: [number, number][] = [];
    const solve = (): boolean => {
      let i = 0;
      while (i < n && used[i]) i++;
      if (i === n) return true;
      used[i] = true;
      for (let j = i + 1; j < n; j++) {
        if (used[j] || met(list[i]!, list[j]!)) continue;
        if (--budget < 0) break;
        used[j] = true;
        chosen.push([i, j]);
        if (solve()) return true;
        chosen.pop();
        used[j] = false;
      }
      used[i] = false;
      return false;
    };
    return solve() ? chosen : null;
  };
  const toPairs = (list: PairingEntrant[], idx: [number, number][]) => idx.map(([i, j]) => assignColors(list[i]!, list[j]!, round));
  if (sorted.length % 2 === 0) {
    const p = perfect(sorted);
    return { pairs: toPairs(sorted, p ?? greedy(sorted, met)), bye: null };
  }
  // Bye candidates from the bottom up, players without a bye first; take the first that leaves a repeat-free pairing.
  const order = sorted.map((_, i) => sorted.length - 1 - i);
  const candidates = [...order.filter((i) => !sorted[i]!.hadBye), ...order.filter((i) => sorted[i]!.hadBye)];
  for (const k of candidates) {
    const rest = sorted.filter((_, i) => i !== k);
    const p = perfect(rest);
    if (p) return { pairs: toPairs(rest, p), bye: sorted[k]!.id };
    if (budget < 0) break;
  }
  const k = candidates[0]!;
  const rest = sorted.filter((_, i) => i !== k);
  return { pairs: toPairs(rest, greedy(rest, met)), bye: sorted[k]!.id };
}

/** Neighbours in order, preferring opponents not met yet; used when no repeat-free pairing exists. */
function greedy(list: PairingEntrant[], met: (a: PairingEntrant, b: PairingEntrant) => boolean): [number, number][] {
  const free = list.map((_, k) => k);
  const out: [number, number][] = [];
  while (free.length > 1) {
    const i = free.shift()!;
    let k = free.findIndex((j) => !met(list[i]!, list[j]!));
    if (k < 0) k = 0;
    out.push([i, free.splice(k, 1)[0]!]);
  }
  return out;
}

/**
 * Arena pairing for the players waiting right now: neighbours in the
 * standings, avoiding an immediate rematch when another opponent is waiting.
 * An odd player out waits for the next game to finish.
 */
export function pairArena(waiting: PairingEntrant[]): PairingResult {
  const free = [...waiting].sort(byStanding);
  const pairs: [string, string][] = [];
  const last = (e: PairingEntrant) => e.opponents[e.opponents.length - 1];
  while (free.length > 1) {
    const a = free.shift()!;
    let k = free.findIndex((b) => last(a) !== b.id && last(b) !== a.id);
    if (k < 0) {
      // Only a rematch is possible. Wait for someone else unless it is just these two.
      if (free.length === 1 && waiting.length === 2) k = 0;
      else continue;
    }
    const b = free.splice(k, 1)[0]!;
    pairs.push(assignColors(a, b, a.opponents.length + 1));
  }
  return { pairs, bye: null };
}

// ---------------------------------------------------------------- standings

export interface StandingInput {
  userId: string;
  score: number;
  rating: number;
  wins: number;
  opponents: string[];
  status: EntrantStatus;
}

/** Buchholz: the sum of the final scores of everyone a player has met. */
export function buchholz(entry: StandingInput, scores: Map<string, number>): number {
  return entry.opponents.reduce((s, id) => s + (scores.get(id) ?? 0), 0);
}

/**
 * Orders entrants for the standings. Removed players go last. Swiss ties are
 * split by Buchholz, then wins, then rating; arena ties by wins then rating.
 */
export function rankEntrants<T extends StandingInput>(format: TournamentFormat, entries: T[]): (T & { rank: number; buchholz: number })[] {
  const scores = new Map(entries.map((e) => [e.userId, e.score]));
  const rows = entries.map((e) => ({ ...e, buchholz: format === 'swiss' ? buchholz(e, scores) : 0 }));
  rows.sort(
    (a, b) =>
      Number(a.status === 'removed') - Number(b.status === 'removed') ||
      b.score - a.score ||
      b.buchholz - a.buchholz ||
      b.wins - a.wins ||
      b.rating - a.rating ||
      (a.userId < b.userId ? -1 : 1),
  );
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Prize for each place that a ranked, non-removed player finished in. */
export function awardPrizes(ranked: { userId: string; rank: number; status: EntrantStatus; games: number }[], pool: PrizePool | null): Map<string, AwardedPrize> {
  const out = new Map<string, AwardedPrize>();
  if (!pool) return out;
  // Only players who actually played can win a prize; places close up behind removed or idle entrants.
  const eligible = ranked.filter((r) => r.status !== 'removed' && r.games > 0);
  for (const p of pool.places) {
    const winner = eligible[p.place - 1];
    if (winner) out.set(winner.userId, { place: p.place, amount: p.amount, currency: pool.currency, label: p.label, paidAt: null });
  }
  return out;
}

/** When an arena ends, or null for swiss. */
export function tournamentEndsAt(t: Pick<TournamentSettings, 'format' | 'startsAt' | 'durationMinutes'>): number | null {
  return t.format === 'arena' && t.durationMinutes ? t.startsAt + t.durationMinutes * 60_000 : null;
}

export function formatPrize(amount: number, currency: string): string {
  const n = Number.isInteger(amount) ? amount.toLocaleString('en-US') : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n} ${currency}`;
}

/** "1st", "2nd"... for notifications written by the server (English). */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
