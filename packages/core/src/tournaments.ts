import type { TimeControl } from './timeControl';

/**
 * Tournaments: staff create and schedule them; players join.
 *
 * Arena: while it runs, the server pairs waiting players (similar scores
 * first) as soon as they finish a game, until the time is up. Most points
 * wins. Points: win 2, draw 1, loss 0, changed by the streak and frenzy
 * options in `TournamentSettings` (see `arenaPoints`).
 *
 * Swiss: a fixed number of rounds; everyone plays once per round against a
 * player on a similar score they have not met. Win 1, draw ½, bye 1.
 *
 * End mode: "wait" lets games still running at the end finish and count;
 * "timer" ends the tournament on time and running games do not count.
 */
export type TournamentStatus = 'scheduled' | 'running' | 'finished' | 'cancelled';

export const TOURNAMENT_FORMATS = ['arena', 'swiss'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];
export const TOURNAMENT_END_MODES = ['wait', 'timer'] as const;
export type TournamentEndMode = (typeof TOURNAMENT_END_MODES)[number];

/** How a tournament is played and scored. */
export interface TournamentSettings {
  format: TournamentFormat;
  /** Swiss: number of rounds. */
  rounds: number;
  /** wait: games running at the end finish and count. timer: the tournament ends on time. */
  endMode: TournamentEndMode;
  /** Arena: after two wins in a row, a win is 4 points instead of 2. */
  winStreak: boolean;
  /** Arena: after two draws in a row, a draw scores nothing. */
  drawStreak: boolean;
  /** Arena: after two losses in a row, a loss costs a point. */
  lossStreak: boolean;
  /** Arena: a player may halve their clock (no increment) for an extra point on a win or draw. */
  frenzy: boolean;
}

export const SWISS_ROUNDS = { min: 3, max: 15 } as const;

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  format: 'arena',
  rounds: 7,
  endMode: 'wait',
  winStreak: true,
  drawStreak: false,
  lossStreak: false,
  frenzy: false,
};

/** Fills stored or partial settings with the defaults (older tournaments have none). */
export function tournamentSettings(raw: unknown): TournamentSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof TournamentSettings, unknown>>;
  const d = DEFAULT_TOURNAMENT_SETTINGS;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const rounds = Math.round(Number(r.rounds));
  return {
    format: (TOURNAMENT_FORMATS as readonly unknown[]).includes(r.format) ? (r.format as TournamentFormat) : d.format,
    rounds: Number.isFinite(rounds) ? Math.min(SWISS_ROUNDS.max, Math.max(SWISS_ROUNDS.min, rounds)) : d.rounds,
    endMode: (TOURNAMENT_END_MODES as readonly unknown[]).includes(r.endMode) ? (r.endMode as TournamentEndMode) : d.endMode,
    winStreak: bool(r.winStreak, d.winStreak),
    drawStreak: bool(r.drawStreak, d.drawStreak),
    lossStreak: bool(r.lossStreak, d.lossStreak),
    frenzy: bool(r.frenzy, d.frenzy),
  };
}

export interface TournamentPrize {
  place: number;
  prize: string;
}

/** Currencies Stripe charges entry fees in. */
export const TOURNAMENT_CURRENCIES = ['eur', 'usd', 'gbp'] as const;
export type TournamentCurrency = (typeof TOURNAMENT_CURRENCIES)[number];

export interface TournamentSponsor {
  name: string;
  url: string | null;
  /** Path of the logo image on the game server (`/api/tournaments/:id/logo?v=…`), or null. */
  logoPath: string | null;
}

/** "€5.00", "$10", "£2.50". */
export function formatMoney(cents: number, currency: string): string {
  const symbol = currency === 'usd' ? '$' : currency === 'gbp' ? '£' : '€';
  const whole = cents % 100 === 0;
  return `${symbol}${(cents / 100).toFixed(whole ? 0 : 2)}`;
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
  /** Entry fee in cents (0 = free) and its currency. */
  entryFeeCents: number;
  currency: TournamentCurrency;
  minRating: number | null;
  maxRating: number | null;
  minRatedGames: number;
  /** Players may join after the start. */
  lateJoin: boolean;
  /** Extra rules from the organisers, accepted when joining. */
  rules: string | null;
  sponsor: TournamentSponsor | null;
  settings: TournamentSettings;
  /** Swiss: the round being played (0 before the first). */
  round: number;
  /** The time is up and the last games are being played ("wait" end mode). */
  finishing: boolean;
  players: number;
  /** Signed-in viewer has joined (and not withdrawn). */
  joined: boolean;
  /** Leader once finished. */
  winner: string | null;
  /** Invite-only: only invited players may join and play; everyone else can watch. */
  private: boolean;
}

/** A player invited to a private tournament. */
export interface TournamentInvitee {
  userId: string;
  username: string;
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
  /** Arena with win streaks: two or more wins in a row, so the next win is worth 4. */
  onFire: boolean;
  /** Swiss: sum of the opponents' scores, the first tie-break. */
  buchholz?: number;
  /** Swiss: rounds without an opponent (each scores a win). */
  byes?: number;
  withdrawn: boolean;
  /** In a tournament game right now. */
  playing: boolean;
}

/** One game a tournament started, with its result once it ends. */
export interface TournamentGameView {
  gameId: string;
  /** Swiss round; null in arenas. */
  round: number | null;
  white: { userId: string; username: string; points: number };
  black: { userId: string; username: string; points: number };
  /** 1-0, 0-1, 1/2-1/2, or * while it is played. */
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  /** How it ended (checkmate, resignation, timeout, aborted, ...); null while it is played. */
  endReason: string | null;
  /** It scored. Aborted games and games cut off by the timer do not. */
  counted: boolean;
  startedAt: number;
  endedAt: number | null;
}

/** A tournament chat message. */
export interface TournamentChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  /** Posted by tournament staff. */
  staff: boolean;
  at: number;
  /** Staff hid it (only staff see hidden messages). */
  hidden?: boolean;
  hiddenBy?: string | null;
}

export interface TournamentDetail extends TournamentSummary {
  standings: TournamentStanding[];
  /** Finished games, newest first (public view: scored games only). */
  games: TournamentGameView[];
  /** Games of this tournament being played right now. */
  liveGames: { gameId: string; white: string; black: string }[];
  /** The viewer's live tournament game, if any. */
  yourGameId: string | null;
  /** About the signed-in viewer; null when signed out. */
  you: TournamentViewer | null;
  /** Private tournaments: the invited players (empty for open tournaments). */
  invited: TournamentInvitee[];
}

export interface TournamentViewer {
  /** Entry fee paid (paid tournaments). */
  paid: boolean;
  /** Why the viewer cannot join (rating out of range, too few games, ...), or null. */
  blocked: string | null;
  /** Prize place won, once the tournament is finished. */
  prizePlace: number | null;
  /** The viewer's payout request, if they made one. */
  payout: { status: PayoutStatus; method: PayoutMethod } | null;
  disqualified: boolean;
  /** Private tournaments: the viewer is on the invite list. */
  invited: boolean;
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
  entryFeeCents: number;
  currency: TournamentCurrency;
  minRating: number | null;
  maxRating: number | null;
  minRatedGames: number;
  lateJoin: boolean;
  rules: string | null;
  sponsorName: string | null;
  sponsorUrl: string | null;
  /** Logo as a data URL; null removes it, undefined keeps the current one. */
  sponsorLogo?: string | null;
  settings: TournamentSettings;
  /** Invite-only: only the invited players may join and play. */
  private: boolean;
  /** Usernames of the invited players (private tournaments; the server looks them up). */
  invited: string[];
}

export const TOURNAMENT_LIMITS = {
  nameMax: 60,
  descriptionMax: 600,
  prizeMax: 80,
  places: 10,
  minMinutes: 10,
  maxMinutes: 600,
  rulesMax: 2000,
  /** €500 per entry at most. */
  feeMaxCents: 50_000,
  /** Logo data URL size (about 300 KB of image). */
  logoMaxChars: 400_000,
  /** Players on a private tournament's invite list. */
  invitedMax: 500,
} as const;

/** The message players get when they are not on a private tournament's invite list. */
export const PRIVATE_TOURNAMENT_BLOCKED = 'This tournament is invite-only';

/** PNG, JPEG or WebP only: an SVG served from the API could carry script. */
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export type TournamentResult = 'win' | 'draw' | 'loss';

/** Same results in a row before this game (only one of them is above 0). */
export interface ArenaRun {
  wins: number;
  draws: number;
  losses: number;
}

/**
 * Arena points for one result. Base: win 2, draw 1, loss 0. With the streak
 * options, after two of the same result in a row: a win is 4, a draw 0, a
 * loss -1. Frenzy adds a point to a win or draw that scored.
 */
export function arenaPoints(result: TournamentResult, run: ArenaRun, s: Pick<TournamentSettings, 'winStreak' | 'drawStreak' | 'lossStreak' | 'frenzy'>, frenzied = false): number {
  let pts: number;
  if (result === 'win') pts = s.winStreak && run.wins >= 2 ? 4 : 2;
  else if (result === 'draw') pts = s.drawStreak && run.draws >= 2 ? 0 : 1;
  else pts = s.lossStreak && run.losses >= 2 ? -1 : 0;
  if (frenzied && s.frenzy && pts > 0) pts += 1;
  return pts;
}

export function nextRun(run: ArenaRun, result: TournamentResult): ArenaRun {
  return {
    wins: result === 'win' ? run.wins + 1 : 0,
    draws: result === 'draw' ? run.draws + 1 : 0,
    losses: result === 'loss' ? run.losses + 1 : 0,
  };
}

/** Swiss points are kept doubled (win 2, draw 1) so they stay whole numbers. */
export const swissPoints = (result: TournamentResult) => (result === 'win' ? 2 : result === 'draw' ? 1 : 0);

export interface SwissEntrant {
  id: string;
  /** Doubled points. */
  score: number;
  rating: number;
  opponents: string[];
  colors: ('w' | 'b')[];
  byes: number;
}

/**
 * Pairs one Swiss round: players sorted by score then rating, each paired
 * with the closest player they have not met (with backtracking); with an odd
 * number, the lowest-ranked player without a bye sits out with a bye. Falls
 * back to allowing a rematch when no clean pairing exists. Colours go to
 * whoever has had that colour less.
 */
export function swissPairings(entrants: SwissEntrant[]): { pairs: [white: string, black: string][]; bye: string | null } {
  const list = [...entrants].sort((a, b) => b.score - a.score || b.rating - a.rating || a.id.localeCompare(b.id));
  let bye: string | null = null;
  if (list.length % 2 === 1) {
    let idx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.byes === 0) {
        idx = i;
        break;
      }
    }
    bye = list.splice(idx, 1)[0]!.id;
  }
  const met = (a: SwissEntrant, b: SwissEntrant) => a.opponents.includes(b.id);
  let budget = 50_000;
  const solve = (rest: SwissEntrant[]): [SwissEntrant, SwissEntrant][] | null => {
    if (!rest.length) return [];
    if (--budget < 0) return null;
    const [a, ...others] = rest;
    for (let j = 0; j < others.length; j++) {
      const b = others[j]!;
      if (met(a!, b)) continue;
      const tail = solve(others.filter((_, k) => k !== j));
      if (tail) return [[a!, b], ...tail];
    }
    return null;
  };
  let pairs = solve(list);
  if (!pairs) {
    // Everyone has met everyone nearby: pair neighbours, rematches allowed.
    pairs = [];
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i]!, list[i + 1]!]);
  }
  const whites = (p: SwissEntrant) => p.colors.filter((c) => c === 'w').length - p.colors.filter((c) => c === 'b').length;
  return {
    bye,
    pairs: pairs.map(([a, b]) => {
      const da = whites(a);
      const db = whites(b);
      const la = a.colors.at(-1);
      const lb = b.colors.at(-1);
      // Fewer whites so far gets white; then whoever had black last; then the higher-ranked player.
      const aWhite = da !== db ? da < db : la !== lb ? la === 'b' || lb === 'w' : true;
      return aWhite ? [a.id, b.id] : [b.id, a.id];
    }),
  };
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

  const optInt = (k: 'minRating' | 'maxRating') => {
    const v = pick(k);
    return v === null || v === undefined || v === '' ? null : Math.round(Number(v));
  };
  const minRating = optInt('minRating');
  const maxRating = optInt('maxRating');
  for (const [field, v] of [
    ['minRating', minRating],
    ['maxRating', maxRating],
  ] as const) {
    if (v !== null && (!Number.isFinite(v) || v < 100 || v > 3500)) return { error: 'Ratings must be 100 to 3500, or empty', field };
  }
  if (minRating !== null && maxRating !== null && minRating > maxRating) return { error: 'The lowest rating is above the highest', field: 'minRating' };
  const minRatedGames = Math.round(Number(pick('minRatedGames') ?? 0) || 0);
  if (minRatedGames < 0 || minRatedGames > 1000) return { error: 'Required games must be 0 to 1000', field: 'minRatedGames' };

  const entryFeeCents = Math.round(Number(pick('entryFeeCents') ?? 0) || 0);
  if (entryFeeCents < 0 || entryFeeCents > TOURNAMENT_LIMITS.feeMaxCents) return { error: 'The entry fee must be 0 to 500', field: 'entryFeeCents' };
  if (entryFeeCents > 0 && entryFeeCents < 100) return { error: 'A paid entry costs at least 1.00', field: 'entryFeeCents' };
  const cur = pick('currency') ?? 'eur';
  if (!(TOURNAMENT_CURRENCIES as readonly unknown[]).includes(cur)) return { error: 'Pick EUR, USD or GBP', field: 'currency' };

  const r = pick('rules');
  const rules = typeof r === 'string' && r.trim() ? r.trim().slice(0, TOURNAMENT_LIMITS.rulesMax) : null;
  const sn = pick('sponsorName');
  const sponsorName = typeof sn === 'string' && sn.trim() ? sn.trim().slice(0, 60) : null;
  const su = pick('sponsorUrl');
  const sponsorUrl = typeof su === 'string' && su.trim() ? su.trim().slice(0, 200) : null;
  if (sponsorUrl && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(sponsorUrl)) return { error: 'The sponsor link must start with https://', field: 'sponsorUrl' };
  let sponsorLogo: string | null | undefined = undefined;
  if (i.sponsorLogo !== undefined) {
    if (i.sponsorLogo === null || i.sponsorLogo === '') sponsorLogo = null;
    else if (typeof i.sponsorLogo !== 'string' || !LOGO_DATA_URL.test(i.sponsorLogo)) return { error: 'The logo must be a PNG, JPEG or WebP image', field: 'sponsorLogo' };
    else if (i.sponsorLogo.length > TOURNAMENT_LIMITS.logoMaxChars) return { error: 'The logo is too large (300 KB at most)', field: 'sponsorLogo' };
    else sponsorLogo = i.sponsorLogo;
  }
  if (sponsorLogo && !sponsorName) return { error: 'Name the sponsor for the logo', field: 'sponsorName' };

  const rawSettings = (pick('settings') ?? {}) as Record<string, unknown>;
  if (typeof rawSettings !== 'object') return { error: 'Invalid tournament settings', field: 'settings' };
  const baseSettings = base?.settings ?? DEFAULT_TOURNAMENT_SETTINGS;
  if (rawSettings.format !== undefined && !(TOURNAMENT_FORMATS as readonly unknown[]).includes(rawSettings.format)) return { error: 'Choose Arena or Swiss', field: 'format' };
  if (rawSettings.endMode !== undefined && !(TOURNAMENT_END_MODES as readonly unknown[]).includes(rawSettings.endMode)) return { error: 'Choose how the tournament ends', field: 'endMode' };
  if (rawSettings.rounds !== undefined) {
    const n = Number(rawSettings.rounds);
    if (!Number.isInteger(n) || n < SWISS_ROUNDS.min || n > SWISS_ROUNDS.max) return { error: `Rounds must be ${SWISS_ROUNDS.min} to ${SWISS_ROUNDS.max}`, field: 'rounds' };
  }
  const settings = tournamentSettings({ ...baseSettings, ...rawSettings });

  const isPrivate = pick('private') === true;
  const invited: string[] = [];
  if (isPrivate) {
    const raw = pick('invited');
    if (raw !== undefined && raw !== null && !Array.isArray(raw)) return { error: 'Invited players must be a list of usernames', field: 'invited' };
    const seen = new Set<string>();
    for (const u of (raw as unknown[] | null | undefined) ?? []) {
      const name = typeof u === 'string' ? u.trim().replace(/^@/, '') : '';
      if (!name) continue;
      if (name.length > 40) return { error: `"${name.slice(0, 40)}…" is not a username`, field: 'invited' };
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      invited.push(name);
    }
    if (invited.length < 2) return { error: 'Invite at least two players to a private tournament', field: 'invited' };
    if (invited.length > TOURNAMENT_LIMITS.invitedMax) return { error: `Invite at most ${TOURNAMENT_LIMITS.invitedMax} players`, field: 'invited' };
  }

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
      entryFeeCents,
      currency: cur as TournamentCurrency,
      minRating,
      maxRating,
      minRatedGames,
      lateJoin: pick('lateJoin') !== false,
      rules,
      sponsorName,
      sponsorUrl,
      ...(sponsorLogo !== undefined ? { sponsorLogo } : {}),
      settings,
      private: isPrivate,
      invited,
    },
  };
}

// ---------------------------------------------------------------- sponsors and payouts

export const SPONSOR_STATUSES = ['new', 'contacted', 'accepted', 'declined'] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];
export const PAYOUT_STATUSES = ['new', 'contacted', 'paid', 'rejected'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const PAYOUT_METHODS = ['paypal', 'bank', 'other'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export interface SponsorApplicationInput {
  name: string;
  email: string;
  company: string | null;
  website: string | null;
  budget: string | null;
  message: string;
}

export interface SponsorApplicationView extends SponsorApplicationInput {
  id: string;
  userId: string | null;
  status: SponsorStatus;
  staffNote: string | null;
  reviewedBy: string | null;
  createdAt: number;
}

export interface PayoutRequestView {
  id: string;
  tournamentId: string;
  tournamentName: string;
  userId: string;
  username: string;
  place: number;
  prize: string;
  method: PayoutMethod;
  details: string;
  note: string | null;
  status: PayoutStatus;
  staffNote: string | null;
  reviewedBy: string | null;
  createdAt: number;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validateSponsorApplication(input: unknown): { value: SponsorApplicationInput } | { error: string; field: string } {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const name = str(i.name, 80);
  if (name.length < 2) return { error: 'Tell us your name', field: 'name' };
  const email = str(i.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address', field: 'email' };
  const message = str(i.message, 2000);
  if (message.length < 10) return { error: 'Tell us a little about what you would like to sponsor', field: 'message' };
  return {
    value: { name, email, message, company: str(i.company, 80) || null, website: str(i.website, 200) || null, budget: str(i.budget, 80) || null },
  };
}

export function validatePayoutRequest(input: unknown): { value: { method: PayoutMethod; details: string; note: string | null } } | { error: string; field: string } {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (!(PAYOUT_METHODS as readonly unknown[]).includes(i.method)) return { error: 'Choose how you want to be paid', field: 'method' };
  const details = str(i.details, 500);
  if (details.length < 4) return { error: 'Add your payment details (PayPal email, IBAN, ...)', field: 'details' };
  return { value: { method: i.method as PayoutMethod, details, note: str(i.note, 1000) || null } };
}
