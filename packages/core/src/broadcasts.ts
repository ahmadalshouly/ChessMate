/**
 * Watch: streamers and broadcast chess events.
 *
 * Streamers: players apply with their channels; staff approve them (streamer
 * badge). Approved streamers keep a profile (headline, channels) and switch
 * "live" on and off.
 *
 * Events: tournaments ChessMate broadcasts. An event has players, rounds and
 * games, news and standings (computed from the results). Games arrive by
 * pasted PGN, a live PGN link the server polls (DGT boards, LiveChessCloud)
 * or a Lichess broadcast round. Official Lichess broadcasts can be imported
 * automatically. Staff manage every event; an approved organiser manages
 * only the events they were given.
 */
import { Chess } from 'chess.js';

import { isChessTitle, type ChessTitle } from './titles';
import { COUNTRY_CODES } from './profile';
import type { MoveClass, Score } from './evaluation';
import { cleanImage, cleanLinks, type PostLink } from './media';
import { splitPgn } from './pgn';
import type { GameResult } from './types';

type Clean<T> = { value: T } | { error: string; field?: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function text(v: unknown, field: string, label: string, min: number, max: number): Clean<string> {
  const s = str(v);
  if (s.length < min) return { error: min <= 1 ? `${label} is required` : `${label} needs at least ${min} characters`, field };
  if (s.length > max) return { error: `${label} can be at most ${max} characters`, field };
  return { value: s };
}

function httpsUrl(v: unknown, field: string, max = 500): Clean<string> {
  let s = str(v);
  if (!s) return { error: 'Enter a link', field };
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  if (s.length > max) return { error: 'This link is too long', field };
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
    if (!u.hostname.includes('.')) throw new Error();
    if (u.protocol === 'http:') u.protocol = 'https:';
    return { value: u.toString() };
  } catch {
    return { error: 'Enter a valid link', field };
  }
}

// ---------------------------------------------------------------------------
// Streamers

export const STREAM_PLATFORMS = ['twitch', 'youtube', 'kick', 'other'] as const;
export type StreamPlatform = (typeof STREAM_PLATFORMS)[number];

const PLATFORM_HOSTS: Record<Exclude<StreamPlatform, 'other'>, string[]> = {
  twitch: ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  kick: ['kick.com', 'www.kick.com'],
};

export interface StreamChannel {
  platform: StreamPlatform;
  url: string;
}

export const STREAMER_LIMITS = {
  headline: 120,
  about: 1000,
  channels: 10,
  liveTitle: 120,
  /** Live switches itself off after this long. */
  liveHours: 12,
  /** Applications a player may send in 30 days. */
  applicationsPer30d: 3,
} as const;

/** The platform a channel link belongs to. */
export function platformOf(url: string): StreamPlatform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [p, hosts] of Object.entries(PLATFORM_HOSTS)) if (hosts.includes(host)) return p as StreamPlatform;
  } catch {
    // not a URL
  }
  return 'other';
}

/** A channel link: https, and on the platform's own site unless "other". */
export function cleanChannel(raw: unknown): Clean<StreamChannel> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { platform?: unknown; url?: unknown };
  const url = httpsUrl(r.url, 'channels', 300);
  if ('error' in url) return url;
  const detected = platformOf(url.value);
  const asked = (STREAM_PLATFORMS as readonly unknown[]).includes(r.platform) ? (r.platform as StreamPlatform) : detected;
  if (asked !== 'other' && detected !== asked) return { error: `That is not a ${asked[0]!.toUpperCase()}${asked.slice(1)} link`, field: 'channels' };
  return { value: { platform: detected === 'other' ? asked : detected, url: url.value } };
}

function cleanChannels(raw: unknown): Clean<StreamChannel[]> {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Add at least one channel', field: 'channels' };
  if (raw.length > STREAMER_LIMITS.channels) return { error: `At most ${STREAMER_LIMITS.channels} channels`, field: 'channels' };
  const out: StreamChannel[] = [];
  for (const c of raw) {
    const r = cleanChannel(c);
    if ('error' in r) return r;
    if (!out.some((x) => x.url === r.value.url)) out.push(r.value);
  }
  return { value: out };
}

export interface StreamerApplicationInput {
  channels: StreamChannel[];
  about: string;
}

export function cleanStreamerApplication(raw: unknown): Clean<StreamerApplicationInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const channels = cleanChannels(r.channels);
  if ('error' in channels) return channels;
  const about = text(r.about, 'about', 'Tell us about your streams', 20, STREAMER_LIMITS.about);
  if ('error' in about) return about;
  return { value: { channels: channels.value, about: about.value } };
}

export interface StreamerProfileInput {
  headline: string;
  channels: StreamChannel[];
}

export function cleanStreamerProfile(raw: unknown): Clean<StreamerProfileInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const headline = text(r.headline, 'headline', 'Headline', 0, STREAMER_LIMITS.headline);
  if ('error' in headline) return headline;
  const channels = cleanChannels(r.channels);
  if ('error' in channels) return channels;
  return { value: { headline: headline.value, channels: channels.value } };
}

export interface GoLiveInput {
  title: string;
  url: string;
}

/** Going live: a title and one of the streamer's channels (or another link on a known platform). */
export function cleanGoLive(raw: unknown, channels: StreamChannel[]): Clean<GoLiveInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = text(r.title, 'title', 'Stream title', 0, STREAMER_LIMITS.liveTitle);
  if ('error' in title) return title;
  let link = channels[0]?.url ?? '';
  if (r.url !== undefined && r.url !== null && r.url !== '') {
    const c = cleanChannel({ url: r.url });
    if ('error' in c) return { error: c.error, field: 'url' };
    link = c.value.url;
  }
  if (!link) return { error: 'Add a channel first', field: 'url' };
  const known = channels.some((c) => c.url === link) || platformOf(link) !== 'other';
  if (!known) return { error: 'Use one of your channels or a Twitch, YouTube or Kick link', field: 'url' };
  return { value: { title: title.value, url: link } };
}

export interface StreamerLive {
  since: number;
  title: string;
  url: string;
  platform: StreamPlatform;
  /** Viewers now, when the platform tells (detected streams). */
  viewers: number | null;
  thumbnail: string | null;
  /** For an embedded player: the platform and its channel or video id. */
  embed: { platform: 'twitch' | 'youtube' | 'kick'; id: string } | null;
  /** Found by ChessMate's live check rather than switched on by hand. */
  auto: boolean;
}

/** A channel as the platform knows it: Twitch login, Kick slug, YouTube handle ("@name") or channel id ("UC…"). */
export function channelHandle(url: string): { platform: 'twitch' | 'youtube' | 'kick'; handle: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const platform = platformOf(url);
  const parts = u.pathname.split('/').filter(Boolean);
  if (platform === 'twitch' || platform === 'kick') {
    const name = parts[0]?.toLowerCase();
    if (!name || !/^[a-z0-9_-]{2,40}$/.test(name) || ['videos', 'directory', 'search', 'categories', 'browse'].includes(name)) return null;
    return { platform, handle: name };
  }
  if (platform === 'youtube') {
    if (parts[0]?.startsWith('@')) return { platform, handle: parts[0] };
    if (parts[0] === 'channel' && parts[1] && /^UC[\w-]{20,}$/.test(parts[1])) return { platform, handle: parts[1] };
    if ((parts[0] === 'c' || parts[0] === 'user') && parts[1]) return { platform, handle: `${parts[0]}/${parts[1]}` };
  }
  return null;
}

/** Parses a stored embed ("twitch:name"). */
export function parseEmbed(v: string | null | undefined): StreamerLive['embed'] {
  const m = /^(twitch|youtube|kick):(.+)$/.exec(v ?? '');
  return m ? { platform: m[1] as 'twitch' | 'youtube' | 'kick', id: m[2]! } : null;
}

export interface StreamerView {
  userId: string;
  username: string;
  displayName: string;
  title: ChessTitle | null;
  country: string | null;
  headline: string;
  channels: StreamChannel[];
  live: StreamerLive | null;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface StreamerApplicationView {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  channels: StreamChannel[];
  about: string;
  status: ApplicationStatus;
  note: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

/** What Settings → Streamer shows the signed-in player. */
export interface MyStreamerState {
  streamer: StreamerView | null;
  application: StreamerApplicationView | null;
  canApply: boolean;
}

// ---------------------------------------------------------------------------
// Events

export const EVENT_FORMATS = ['swiss', 'roundRobin', 'knockout', 'team', 'arena', 'match', 'other'] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];
export type EventStatus = 'upcoming' | 'live' | 'finished';
export type EventSource = 'chessmate' | 'lichess';
export const ROUND_SOURCE_KINDS = ['manual', 'pgnUrl', 'lichess'] as const;
export type RoundSourceKind = (typeof ROUND_SOURCE_KINDS)[number];

export const EVENT_LIMITS = {
  name: 120,
  short: 200,
  description: 8000,
  location: 120,
  timeControl: 60,
  logoMaxChars: 400_000,
  players: 1000,
  rounds: 60,
  gamesPerRound: 500,
  pgnChars: 3_000_000,
  newsTitle: 140,
  newsBody: 8000,
  applicationsPer30d: 3,
  organizers: 10,
} as const;

export interface EventSummary {
  id: string;
  name: string;
  shortDescription: string;
  location: string;
  startsAt: number;
  endsAt: number;
  format: EventFormat;
  timeControl: string;
  status: EventStatus;
  featured: boolean;
  /** Visible to everyone (organisers and staff also see unpublished events). */
  published: boolean;
  /** Taken down by staff: only staff see it. */
  hidden: boolean;
  source: EventSource;
  /** Where an imported event came from (credit link). */
  sourceUrl: string | null;
  logoPath: string | null;
  /** Cover picture shown at the top of the event. */
  coverPath: string | null;
  playerCount: number;
  roundCount: number;
  liveGames: number;
  /** The round being played, or the next one. */
  currentRound: { id: string; number: number; name: string } | null;
}

export interface EventPlayerView {
  id: string;
  name: string;
  title: ChessTitle | null;
  rating: number | null;
  federation: string | null;
  fideId: string | null;
  /** Linked ChessMate account. */
  userId: string | null;
  username: string | null;
}

export interface EventGamePlayer {
  name: string;
  title: ChessTitle | null;
  rating: number | null;
  federation: string | null;
  playerId: string | null;
}

export type EventGameStatus = 'notStarted' | 'live' | 'finished';

export interface EventGameSummary {
  id: string;
  roundId: string;
  board: number;
  white: EventGamePlayer;
  black: EventGamePlayer;
  result: GameResult;
  status: EventGameStatus;
  fen: string;
  lastMove: string | null;
  ply: number;
  /** Clocks at the last update (ms), when the source has them. */
  whiteClockMs: number | null;
  blackClockMs: number | null;
  /** When the clocks were read (server time, ms). */
  clockAt: number | null;
  /** Engine evaluation of the current position (White's view), once analysed. */
  evalScore: Score | null;
  /** Grade of the last move, once analysed. */
  lastGrade: MoveClass | null;
  /** How a finished game ended (null while playing or when it can't be told). */
  ending: GameEnding | null;
}

/** How a finished broadcast game ended. */
export const GAME_ENDINGS = ['checkmate', 'resign', 'timeout', 'stalemate', 'repetition', 'insufficient', 'fiftyMove', 'agreement', 'forfeit'] as const;
export type GameEnding = (typeof GAME_ENDINGS)[number];

/**
 * How a finished game ended, from what a broadcast gives: the final position
 * (checkmate, stalemate, bare kings, 50 moves), the moves (threefold repetition),
 * the clocks (a flag fell), the PGN's Termination tag, and otherwise the result
 * (a decisive game without mate was resigned, a draw was agreed).
 */
export function gameEndingOf(g: {
  result: GameResult;
  fen: string;
  moves?: string[];
  initialFen?: string;
  whiteClockMs?: number | null;
  blackClockMs?: number | null;
  termination?: string | null;
  /** Plies played: a result without moves (published pairing) tells nothing about how it ended. */
  ply?: number;
}): GameEnding | null {
  if (g.result === '*' || g.ply === 0 || (g.moves && g.moves.length === 0)) return null;
  const term = (g.termination ?? '').toLowerCase();
  let chess: Chess;
  try {
    chess = new Chess(g.fen);
  } catch {
    return null;
  }
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (/forfeit|abandon|rules|unterminated|no.?show/.test(term) && !term.includes('time')) return 'forfeit';
  if (term.includes('time')) return 'timeout';
  const decisive = g.result !== '1/2-1/2';
  if (decisive) {
    const loserClock = g.result === '1-0' ? g.blackClockMs : g.whiteClockMs;
    if (typeof loserClock === 'number' && loserClock <= 0) return 'timeout';
    return 'resign';
  }
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (g.moves?.length) {
    try {
      const replay = new Chess(g.initialFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      for (const m of g.moves) replay.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (replay.isThreefoldRepetition()) return 'repetition';
    } catch {
      // moves that don't replay: fall through
    }
  }
  if (Number(g.fen.split(' ')[4] ?? 0) >= 100) return 'fiftyMove';
  return 'agreement';
}

export interface EventGameDetail extends EventGameSummary {
  eventId: string;
  eventName: string;
  roundName: string;
  initialFen: string;
  moves: string[];
  /** Clock after each ply (ms), when known. */
  clocks: (number | null)[];
  /** Live engine analysis, shared by every viewer and filled in as moves arrive. */
  analysis: {
    /** Score of each position (index = plies played), White's view. */
    scores: (Score | null)[];
    /** Engine's best move in each position. */
    best: (string | null)[];
    /** Grade of each move (index = ply - 1). */
    grades: (MoveClass | null)[];
  };
}

export interface EventRoundView {
  id: string;
  number: number;
  name: string;
  startsAt: number | null;
  status: EventStatus;
  games: EventGameSummary[];
  /** Managers only: where games come from. */
  source?: { kind: RoundSourceKind; url: string | null; lichessRoundId: string | null; lastSyncAt: number | null; syncError: string | null };
}

export interface EventStandingRow {
  rank: number;
  playerId: string | null;
  name: string;
  title: ChessTitle | null;
  rating: number | null;
  federation: string | null;
  points: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  buchholz: number;
  /** Rough performance rating: average opponent rating + 400 × (wins − losses) / games. */
  performance: number | null;
}

export interface EventNewsView {
  id: string;
  title: string;
  body: string;
  imagePath: string | null;
  links: PostLink[];
  author: { id: string; username: string; displayName: string } | null;
  createdAt: number;
}

export interface EventDetail extends EventSummary {
  description: string;
  website: string | null;
  /** Extra links (pairings, live commentary, photos…). */
  links: PostLink[];
  rounds: EventRoundView[];
  players: EventPlayerView[];
  standings: EventStandingRow[];
  news: EventNewsView[];
  /** The viewer may edit this event (staff or one of its organisers). */
  canManage: boolean;
  /** Managers only. */
  organizers?: { userId: string; username: string; displayName: string }[];
}

export interface EventInput {
  name: string;
  shortDescription: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number;
  format: EventFormat;
  timeControl: string;
  website: string | null;
  /** Data URL; null removes it, undefined keeps it. */
  logo?: string | null;
  /** Cover picture as a data URL; null removes it, undefined keeps it. */
  cover?: string | null;
  links: PostLink[];
}

const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function cleanEventInput(raw: unknown): Clean<EventInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = text(r.name, 'name', 'Event name', 3, EVENT_LIMITS.name);
  if ('error' in name) return name;
  const short = text(r.shortDescription, 'shortDescription', 'Summary', 0, EVENT_LIMITS.short);
  if ('error' in short) return short;
  const description = text(r.description, 'description', 'Description', 0, EVENT_LIMITS.description);
  if ('error' in description) return description;
  const location = text(r.location, 'location', 'Location', 0, EVENT_LIMITS.location);
  if ('error' in location) return location;
  const timeControl = text(r.timeControl, 'timeControl', 'Time control', 0, EVENT_LIMITS.timeControl);
  if ('error' in timeControl) return timeControl;
  const startsAt = Number(r.startsAt);
  const endsAt = Number(r.endsAt);
  if (!Number.isFinite(startsAt) || startsAt <= 0) return { error: 'Choose a start date', field: 'startsAt' };
  if (!Number.isFinite(endsAt) || endsAt < startsAt) return { error: 'The end must be after the start', field: 'endsAt' };
  if (endsAt - startsAt > 120 * 86_400_000) return { error: 'An event can last at most 120 days', field: 'endsAt' };
  const format = (EVENT_FORMATS as readonly unknown[]).includes(r.format) ? (r.format as EventFormat) : 'other';
  let website: string | null = null;
  if (str(r.website)) {
    const w = httpsUrl(r.website, 'website', 300);
    if ('error' in w) return w;
    website = w.value;
  }
  let logo: string | null | undefined;
  if (r.logo === null) logo = null;
  else if (r.logo !== undefined) {
    if (typeof r.logo !== 'string' || !LOGO_DATA_URL.test(r.logo)) return { error: 'The logo must be a PNG, JPEG or WebP image', field: 'logo' };
    if (r.logo.length > EVENT_LIMITS.logoMaxChars) return { error: 'The logo is too large (300 KB at most)', field: 'logo' };
    logo = r.logo;
  }
  const cover = cleanImage(r.cover, 'cover');
  if ('error' in cover) return cover;
  const links = cleanLinks(r.links);
  if ('error' in links) return links;
  return {
    value: {
      name: name.value,
      shortDescription: short.value,
      description: description.value,
      location: location.value,
      startsAt: Math.round(startsAt),
      endsAt: Math.round(endsAt),
      format,
      timeControl: timeControl.value,
      website,
      ...(logo !== undefined ? { logo } : {}),
      ...(cover.value !== undefined ? { cover: cover.value } : {}),
      links: links.value,
    },
  };
}

export interface EventPlayerInput {
  name: string;
  title: ChessTitle | null;
  rating: number | null;
  federation: string | null;
  fideId: string | null;
  /** ChessMate username to link, or null. */
  username: string | null;
}

export function cleanPlayerInput(raw: unknown): Clean<EventPlayerInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = text(r.name, 'name', 'Player name', 2, 80);
  if ('error' in name) return name;
  const title = str(r.title).toUpperCase();
  if (title && !isChessTitle(title)) return { error: 'Unknown title', field: 'title' };
  let rating: number | null = null;
  if (r.rating !== null && r.rating !== undefined && r.rating !== '') {
    rating = Number(r.rating);
    if (!Number.isInteger(rating) || rating < 0 || rating > 3500) return { error: 'Rating must be 0 to 3500', field: 'rating' };
  }
  const fed = str(r.federation).toUpperCase();
  if (fed && !COUNTRY_CODES.has(fed)) return { error: 'Unknown federation', field: 'federation' };
  const fide = str(r.fideId);
  if (fide && !/^\d{1,12}$/.test(fide)) return { error: 'A FIDE ID is digits only', field: 'fideId' };
  const username = str(r.username).replace(/^@/, '');
  return { value: { name: name.value, title: title ? (title as ChessTitle) : null, rating, federation: fed || null, fideId: fide || null, username: username || null } };
}

export interface RoundInput {
  number: number;
  name: string;
  startsAt: number | null;
  source: { kind: RoundSourceKind; url: string | null; lichessRoundId: string | null };
}

/** A Lichess broadcast round id from an id or a broadcast link (the last 8-character path part). */
export function lichessRoundIdOf(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9]{8}$/.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/(^|\.)lichess\.org$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('broadcast');
    if (i < 0) return null;
    const last = parts[parts.length - 1]!;
    return parts.length - i >= 4 && /^[A-Za-z0-9]{8}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

export function cleanRoundInput(raw: unknown): Clean<RoundInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const number = Number(r.number);
  if (!Number.isInteger(number) || number < 1 || number > 99) return { error: 'Round number must be 1 to 99', field: 'number' };
  const name = text(r.name, 'name', 'Round name', 0, 60);
  if ('error' in name) return name;
  let startsAt: number | null = null;
  if (r.startsAt !== null && r.startsAt !== undefined && r.startsAt !== '') {
    startsAt = Number(r.startsAt);
    if (!Number.isFinite(startsAt) || startsAt <= 0) return { error: 'Invalid start time', field: 'startsAt' };
  }
  const s = (r.source && typeof r.source === 'object' ? r.source : {}) as Record<string, unknown>;
  const kind = (ROUND_SOURCE_KINDS as readonly unknown[]).includes(s.kind) ? (s.kind as RoundSourceKind) : 'manual';
  let url: string | null = null;
  let lichessRoundId: string | null = null;
  if (kind === 'pgnUrl') {
    const u = httpsUrl(s.url, 'source');
    if ('error' in u) return u;
    url = u.value;
  } else if (kind === 'lichess') {
    lichessRoundId = lichessRoundIdOf(str(s.lichessRoundId ?? s.url));
    if (!lichessRoundId) return { error: 'Paste a Lichess broadcast round link', field: 'source' };
  }
  return { value: { number, name: name.value || `Round ${number}`, startsAt: startsAt === null ? null : Math.round(startsAt), source: { kind, url, lichessRoundId } } };
}

export function cleanEventNews(raw: unknown): Clean<{ title: string; body: string; image: string | null; links: PostLink[] }> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = text(r.title, 'title', 'Title', 3, EVENT_LIMITS.newsTitle);
  if ('error' in title) return title;
  const body = text(r.body, 'body', 'Text', 1, EVENT_LIMITS.newsBody);
  if ('error' in body) return body;
  const image = cleanImage(r.image);
  if ('error' in image) return image;
  const links = cleanLinks(r.links);
  if ('error' in links) return links;
  return { value: { title: title.value, body: body.value, image: image.value ?? null, links: links.value } };
}

export interface EventApplicationInput {
  eventName: string;
  organization: string;
  website: string | null;
  location: string;
  startsAt: number;
  endsAt: number;
  description: string;
  /** How the games will be sent (DGT boards, PGN link, Lichess, by hand…). */
  coverage: string;
}

export function cleanEventApplication(raw: unknown): Clean<EventApplicationInput> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const eventName = text(r.eventName, 'eventName', 'Event name', 3, EVENT_LIMITS.name);
  if ('error' in eventName) return eventName;
  const organization = text(r.organization, 'organization', 'Organiser', 2, 120);
  if ('error' in organization) return organization;
  const location = text(r.location, 'location', 'Location', 2, EVENT_LIMITS.location);
  if ('error' in location) return location;
  const description = text(r.description, 'description', 'Description', 20, 2000);
  if ('error' in description) return description;
  const coverage = text(r.coverage, 'coverage', 'How games will be sent', 0, 500);
  if ('error' in coverage) return coverage;
  const startsAt = Number(r.startsAt);
  const endsAt = Number(r.endsAt);
  if (!Number.isFinite(startsAt) || startsAt <= 0) return { error: 'Choose a start date', field: 'startsAt' };
  if (!Number.isFinite(endsAt) || endsAt < startsAt) return { error: 'The end must be after the start', field: 'endsAt' };
  let website: string | null = null;
  if (str(r.website)) {
    const w = httpsUrl(r.website, 'website', 300);
    if ('error' in w) return w;
    website = w.value;
  }
  return { value: { eventName: eventName.value, organization: organization.value, website, location: location.value, startsAt: Math.round(startsAt), endsAt: Math.round(endsAt), description: description.value, coverage: coverage.value } };
}

export interface EventApplicationView extends EventApplicationInput {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  status: ApplicationStatus;
  note: string | null;
  /** The event created for an approved application. */
  eventId: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

// ---------------------------------------------------------------------------
// PGN from broadcasts

export interface BroadcastPgnGame {
  white: string;
  black: string;
  whiteTitle: ChessTitle | null;
  blackTitle: ChessTitle | null;
  whiteElo: number | null;
  blackElo: number | null;
  whiteFideId: string | null;
  blackFideId: string | null;
  whiteFed: string | null;
  blackFed: string | null;
  result: GameResult;
  initialFen: string;
  moves: string[];
  /** Clock after each ply from [%clk] comments (ms), null where missing. */
  clocks: (number | null)[];
  board: number | null;
  round: string | null;
  /** The PGN's Termination tag ("Normal", "Time forfeit"…), when given. */
  termination: string | null;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RESULTS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];

function clockMs(comment: string): number | null {
  const m = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(comment);
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : null;
}

/** FIDE federation codes (as Lichess and PGN files give them) to ISO country codes, for flags. */
const FIDE_FEDERATIONS: Record<string, string> = {
  AFG: 'AF', ALB: 'AL', ALG: 'DZ', AND: 'AD', ANG: 'AO', ANT: 'AG', ARG: 'AR', ARM: 'AM', ARU: 'AW', AUS: 'AU', AUT: 'AT', AZE: 'AZ',
  BAH: 'BS', BRN: 'BH', BAN: 'BD', BAR: 'BB', BLR: 'BY', BEL: 'BE', BIZ: 'BZ', BEN: 'BJ', BER: 'BM', BHU: 'BT', BOL: 'BO', BIH: 'BA',
  BOT: 'BW', BRA: 'BR', IVB: 'VG', BRU: 'BN', BUL: 'BG', BUR: 'BF', BDI: 'BI', CAM: 'KH', CMR: 'CM', CAN: 'CA', CPV: 'CV', CAY: 'KY',
  CAF: 'CF', CHA: 'TD', CHI: 'CL', CHN: 'CN', TPE: 'TW', COL: 'CO', COM: 'KM', CGO: 'CG', COD: 'CD', CRC: 'CR', CIV: 'CI', CRO: 'HR',
  CUB: 'CU', CYP: 'CY', CZE: 'CZ', DEN: 'DK', DJI: 'DJ', DMA: 'DM', DOM: 'DO', ECU: 'EC', EGY: 'EG', ESA: 'SV', ENG: 'GB', SCO: 'GB',
  WLS: 'GB', GEQ: 'GQ', ERI: 'ER', EST: 'EE', SWZ: 'SZ', ETH: 'ET', FAI: 'FO', FIJ: 'FJ', FIN: 'FI', FRA: 'FR', GAB: 'GA', GAM: 'GM',
  GEO: 'GE', GER: 'DE', GHA: 'GH', GRE: 'GR', GRN: 'GD', GUM: 'GU', GUA: 'GT', GUI: 'GN', GUY: 'GY', HAI: 'HT', HON: 'HN', HKG: 'HK',
  HUN: 'HU', ISL: 'IS', IND: 'IN', INA: 'ID', IRI: 'IR', IRQ: 'IQ', IRL: 'IE', IOM: 'IM', ISR: 'IL', ITA: 'IT', JAM: 'JM', JPN: 'JP',
  JCI: 'JE', JOR: 'JO', KAZ: 'KZ', KEN: 'KE', KOS: 'XK', KUW: 'KW', KGZ: 'KG', LAO: 'LA', LAT: 'LV', LBN: 'LB', LES: 'LS', LBR: 'LR',
  LBA: 'LY', LIE: 'LI', LTU: 'LT', LUX: 'LU', MAC: 'MO', MAD: 'MG', MAW: 'MW', MAS: 'MY', MDV: 'MV', MLI: 'ML', MLT: 'MT', MTN: 'MR',
  MRI: 'MU', MEX: 'MX', MDA: 'MD', MNC: 'MC', MGL: 'MN', MNE: 'ME', MAR: 'MA', MOZ: 'MZ', MYA: 'MM', NAM: 'NA', NRU: 'NR', NEP: 'NP',
  NED: 'NL', NZL: 'NZ', NCA: 'NI', NIG: 'NE', NGR: 'NG', MKD: 'MK', NOR: 'NO', OMA: 'OM', PAK: 'PK', PLW: 'PW', PLE: 'PS', PAN: 'PA',
  PNG: 'PG', PAR: 'PY', PER: 'PE', PHI: 'PH', POL: 'PL', POR: 'PT', PUR: 'PR', QAT: 'QA', ROU: 'RO', RUS: 'RU', RWA: 'RW', SKN: 'KN',
  LCA: 'LC', VIN: 'VC', SAM: 'WS', SMR: 'SM', STP: 'ST', KSA: 'SA', SEN: 'SN', SRB: 'RS', SEY: 'SC', SLE: 'SL', SGP: 'SG', SVK: 'SK',
  SLO: 'SI', SOL: 'SB', SOM: 'SO', RSA: 'ZA', KOR: 'KR', PRK: 'KP', SSD: 'SS', ESP: 'ES', SRI: 'LK', SUD: 'SD', SUR: 'SR', SWE: 'SE',
  SUI: 'CH', SYR: 'SY', TJK: 'TJ', TAN: 'TZ', THA: 'TH', TLS: 'TL', TOG: 'TG', TGA: 'TO', TTO: 'TT', TUN: 'TN', TUR: 'TR', TKM: 'TM',
  UGA: 'UG', UKR: 'UA', UAE: 'AE', USA: 'US', URU: 'UY', ISV: 'VI', UZB: 'UZ', VAN: 'VU', VEN: 'VE', VIE: 'VN', YEM: 'YE', ZAM: 'ZM',
  ZIM: 'ZW',
};

/** A federation as an ISO country code: accepts ISO ("BE") or FIDE ("BEL") codes; null when unknown (e.g. "FID"). */
export function federationIso(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toUpperCase();
  if (!s) return null;
  const iso = s.length === 3 ? FIDE_FEDERATIONS[s] : s;
  return iso && COUNTRY_CODES.has(iso) ? iso : null;
}

const fed = (v: string | undefined) => federationIso(v);

/**
 * Lichess and other tools write several comments on one move
 * ("{ [%eval 0.3] } { Inaccuracy. Bc6 was best. } { [%clk 0:41:55] }"); joined into one,
 * clocks and evals stay readable and the chess library accepts the game.
 */
function joinComments(pgn: string): string {
  return pgn.replace(/\}\s*\{/g, ' ');
}

/** The game without any comments or variations: the last resort for a file the library rejects. */
function bareMoves(pgn: string): string {
  const cut = pgn.search(/\n\s*\n/);
  if (cut < 0) return pgn;
  let moves = pgn.slice(cut).replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  // Drop variations (nested parentheses), innermost first.
  for (let i = 0; i < 20 && /\([^()]*\)/.test(moves); i++) moves = moves.replace(/\([^()]*\)/g, ' ');
  return pgn.slice(0, cut) + moves.replace(/\$\d+/g, ' ');
}

function loadBroadcastGame(chunk: string): Chess {
  for (const text of [joinComments(chunk), chunk, bareMoves(chunk)]) {
    try {
      const chess = new Chess();
      chess.loadPgn(text);
      return chess;
    } catch {
      // try the next, simpler form
    }
  }
  throw new Error('Unreadable game');
}
const elo = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 4000 ? n : null;
};
const title = (v: string | undefined) => {
  const s = (v ?? '').trim().toUpperCase();
  return s && isChessTitle(s) ? (s as ChessTitle) : null;
};

/**
 * Games from a broadcast PGN file: players, ratings, titles, moves, clocks,
 * board and round. Games still in progress (result "*") are kept. Games that
 * do not parse are skipped.
 */
export function parseBroadcastPgn(textIn: string): BroadcastPgnGame[] {
  const out: BroadcastPgnGame[] = [];
  for (const chunk of splitPgn(textIn)) {
    try {
      const chess = loadBroadcastGame(chunk);
      const h = chess.getHeaders() as Record<string, string | undefined>;
      const fenOf = new Map<string, string>();
      for (const c of chess.getComments()) fenOf.set(c.fen, c.comment);
      const history = chess.history({ verbose: true });
      const moves = history.map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
      const clocks = history.map((m) => {
        const c = fenOf.get(m.after);
        return c ? clockMs(c) : null;
      });
      const result = RESULTS.includes(h.Result as GameResult) ? (h.Result as GameResult) : '*';
      const boardTag = h.Board ?? (h.Round?.includes('.') ? h.Round.split('.').pop() : undefined);
      const board = Number(boardTag);
      out.push({
        white: (h.White ?? '').trim() || 'White',
        black: (h.Black ?? '').trim() || 'Black',
        whiteTitle: title(h.WhiteTitle),
        blackTitle: title(h.BlackTitle),
        whiteElo: elo(h.WhiteElo),
        blackElo: elo(h.BlackElo),
        whiteFideId: /^\d+$/.test(h.WhiteFideId ?? '') ? h.WhiteFideId! : null,
        blackFideId: /^\d+$/.test(h.BlackFideId ?? '') ? h.BlackFideId! : null,
        whiteFed: fed(h.WhiteFed ?? h.WhiteTeamCountry),
        blackFed: fed(h.BlackFed ?? h.BlackTeamCountry),
        result,
        initialFen: h.FEN && h.SetUp !== '0' ? h.FEN : START,
        moves,
        clocks,
        board: Number.isInteger(board) && board > 0 ? board : null,
        round: h.Round && h.Round !== '?' ? h.Round : null,
        termination: h.Termination?.trim() || null,
      });
    } catch {
      // A broken game in a live file: skip it, the rest still counts.
    }
  }
  return out;
}

export function gameStatusOf(result: GameResult, ply: number): EventGameStatus {
  return result !== '*' ? 'finished' : ply > 0 ? 'live' : 'notStarted';
}

/** A round is finished when every game has a result, live once a game has started (or its time has come). */
export function roundStatusOf(games: { result: GameResult; ply: number }[], startsAt: number | null, now: number): EventStatus {
  if (games.length && games.every((g) => g.result !== '*')) return 'finished';
  if (games.some((g) => g.result === '*' && g.ply > 0)) return 'live';
  if (games.length && startsAt !== null && now >= startsAt) return 'live';
  return 'upcoming';
}

export function eventStatusOf(e: { startsAt: number; endsAt: number }, rounds: { status: EventStatus }[], now: number): EventStatus {
  if (rounds.some((r) => r.status === 'live')) return 'live';
  if (rounds.length && rounds.every((r) => r.status === 'finished') && now >= e.startsAt) return 'finished';
  if (now < e.startsAt) return 'upcoming';
  // A day after the last day with nothing live, call it finished.
  return now > e.endsAt + 86_400_000 ? 'finished' : 'live';
}

// ---------------------------------------------------------------------------
// Standings

export interface StandingGame {
  white: { name: string; playerId: string | null; rating: number | null };
  black: { name: string; playerId: string | null; rating: number | null };
  result: GameResult;
}

const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9À-ɏЀ-ӿ؀-ۿ]+/g, ' ').trim();

/**
 * Standings from finished games: points (1, ½, 0), Buchholz and a rough
 * performance rating. Players are matched by id when games are linked to the
 * player list, otherwise by name; listed players with no games appear too.
 */
export function computeStandings(players: Pick<EventPlayerView, 'id' | 'name' | 'title' | 'rating' | 'federation'>[], games: StandingGame[]): EventStandingRow[] {
  interface Acc {
    playerId: string | null;
    name: string;
    title: ChessTitle | null;
    rating: number | null;
    federation: string | null;
    points: number;
    wins: number;
    draws: number;
    losses: number;
    opponents: string[];
    oppRatings: number[];
  }
  const rows = new Map<string, Acc>();
  const byName = new Map<string, string>();
  for (const p of players) {
    const key = `p:${p.id}`;
    rows.set(key, { playerId: p.id, name: p.name, title: p.title, rating: p.rating, federation: p.federation, points: 0, wins: 0, draws: 0, losses: 0, opponents: [], oppRatings: [] });
    byName.set(nameKey(p.name), key);
  }
  const keyOf = (s: StandingGame['white']) => {
    if (s.playerId && rows.has(`p:${s.playerId}`)) return `p:${s.playerId}`;
    const k = byName.get(nameKey(s.name));
    if (k) return k;
    const key = `n:${nameKey(s.name)}`;
    if (!rows.has(key)) {
      rows.set(key, { playerId: null, name: s.name, title: null, rating: s.rating, federation: null, points: 0, wins: 0, draws: 0, losses: 0, opponents: [], oppRatings: [] });
      byName.set(nameKey(s.name), key);
    }
    return key;
  };
  for (const g of games) {
    if (g.result === '*') continue;
    const w = keyOf(g.white);
    const b = keyOf(g.black);
    const W = rows.get(w)!;
    const B = rows.get(b)!;
    W.opponents.push(b);
    B.opponents.push(w);
    if (g.black.rating ?? B.rating) W.oppRatings.push((g.black.rating ?? B.rating)!);
    if (g.white.rating ?? W.rating) B.oppRatings.push((g.white.rating ?? W.rating)!);
    if (g.result === '1-0') {
      W.points += 1;
      W.wins += 1;
      B.losses += 1;
    } else if (g.result === '0-1') {
      B.points += 1;
      B.wins += 1;
      W.losses += 1;
    } else {
      W.points += 0.5;
      B.points += 0.5;
      W.draws += 1;
      B.draws += 1;
    }
  }
  const list = [...rows.values()].map((r) => {
    const games = r.wins + r.draws + r.losses;
    const buchholz = r.opponents.reduce((s, k) => s + (rows.get(k)?.points ?? 0), 0);
    const avg = r.oppRatings.length ? r.oppRatings.reduce((a, b) => a + b, 0) / r.oppRatings.length : null;
    const performance = avg !== null && games > 0 ? Math.round(avg + (400 * (r.wins - r.losses)) / games) : null;
    return { ...r, games, buchholz, performance };
  });
  list.sort((a, b) => b.points - a.points || b.buchholz - a.buchholz || b.wins - a.wins || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));
  return list.map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    name: r.name,
    title: r.title,
    rating: r.rating,
    federation: r.federation,
    points: r.points,
    games: r.games,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    buchholz: r.buchholz,
    performance: r.performance,
  }));
}

// ---------------------------------------------------------------------------
// Lichess broadcasts (official, public API)

export const LICHESS_ORIGIN = 'https://lichess.org';

/** The parts of Lichess's broadcast JSON we read. */
export interface LichessBroadcastTour {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  url?: string;
  tier?: number;
  dates?: number[];
  info?: { format?: string; tc?: string; location?: string; website?: string; players?: string; fideTc?: string };
  image?: string;
}

export interface LichessBroadcastRound {
  id: string;
  name: string;
  slug?: string;
  startsAt?: number;
  finished?: boolean;
  ongoing?: boolean;
  url?: string;
}

/** An imported event's fields from a Lichess tournament. */
export function lichessTourToEvent(tour: LichessBroadcastTour, rounds: LichessBroadcastRound[]): EventInput {
  const starts = tour.dates?.[0] ?? rounds.find((r) => r.startsAt)?.startsAt ?? Date.now();
  const ends = tour.dates?.[1] ?? rounds.reduce((m, r) => Math.max(m, r.startsAt ?? 0), starts);
  const fmt = (tour.info?.format ?? '').toLowerCase();
  const format: EventFormat = fmt.includes('swiss')
    ? 'swiss'
    : fmt.includes('round') || fmt.includes('rr')
      ? 'roundRobin'
      : fmt.includes('knock') || fmt.includes('ko')
        ? 'knockout'
        : fmt.includes('team')
          ? 'team'
          : fmt.includes('match')
            ? 'match'
            : 'other';
  return {
    name: tour.name.slice(0, EVENT_LIMITS.name),
    shortDescription: [tour.info?.format, tour.info?.players].filter(Boolean).join(' · ').slice(0, EVENT_LIMITS.short),
    description: (tour.description ?? '').slice(0, EVENT_LIMITS.description),
    location: (tour.info?.location ?? '').slice(0, EVENT_LIMITS.location),
    startsAt: starts,
    endsAt: Math.max(ends, starts),
    format,
    timeControl: (tour.info?.tc ?? tour.info?.fideTc ?? '').slice(0, EVENT_LIMITS.timeControl),
    website: tour.info?.website && /^https:\/\//.test(tour.info.website) ? tour.info.website.slice(0, 300) : null,
    links: [],
  };
}
