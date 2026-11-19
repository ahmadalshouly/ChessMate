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
  /** About the signed-in viewer; null when signed out. */
  you: TournamentViewer | null;
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
} as const;

/** PNG, JPEG or WebP only: an SVG served from the API could carry script. */
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

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
