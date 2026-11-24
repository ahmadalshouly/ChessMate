/**
 * Push campaigns: notifications staff send from the admin console, either
 * right away, at a set time, or automatically when a player does (or stops
 * doing) something. Shared by the server (/api/admin/campaigns) and the app.
 */

export const CAMPAIGN_KINDS = ['instant', 'scheduled', 'trigger'] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

/**
 * draft: saved, not sent. scheduled: waits for `scheduleAt`. sending: going out now.
 * sent: done. active / paused: a trigger that is (or is not) firing. cancelled: stopped by staff.
 */
export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'active', 'paused', 'cancelled', 'failed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * What a player did (or stopped doing) that fires a trigger.
 *
 *   left_without_playing   opened the app, then left without starting a game; fires `delayMinutes` after they left
 *   inactive               has not opened the app for `days` days; fires once per absence
 *   new_user_no_game       signed up and has not played a game `delayMinutes` later
 *   game_finished          finished an online game; fires `delayMinutes` later (e.g. "review your game")
 */
export const TRIGGER_EVENTS = ['left_without_playing', 'inactive', 'new_user_no_game', 'game_finished'] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export interface CampaignTrigger {
  event: TriggerEvent;
  /** Wait after the event before sending (left_without_playing, new_user_no_game, game_finished). */
  delayMinutes: number;
  /** For `inactive`: days since the player last opened the app. */
  days: number;
  /** Minimum hours between two sends of this trigger to the same player. */
  cooldownHours: number;
  /** Most times one player gets this trigger, ever. 0 = no limit. */
  maxPerUser: number;
}

export const DEFAULT_TRIGGER: CampaignTrigger = { event: 'left_without_playing', delayMinutes: 30, days: 3, cooldownHours: 72, maxPerUser: 0 };

export const CAMPAIGN_PLATFORMS = ['any', 'ios', 'android', 'web'] as const;
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number];

/**
 * Who gets it. Every filter that is set must match (AND). An empty audience
 * is everyone with an open account. `usernames` picks players by name and
 * ignores the other filters.
 */
export interface CampaignAudience {
  usernames: string[];
  /** Device the player has push turned on for ('web' = no phone with push). */
  platform: CampaignPlatform;
  /** Last opened the app at least this many days ago. */
  inactiveDays: number | null;
  /** Opened the app within this many days. */
  activeWithinDays: number | null;
  /** Signed up within this many days. */
  joinedWithinDays: number | null;
  /** Games played (online, all time). */
  minGames: number | null;
  maxGames: number | null;
  /** ISO country codes, upper case. Empty = any. */
  countries: string[];
}

export const EMPTY_AUDIENCE: CampaignAudience = {
  usernames: [],
  platform: 'any',
  inactiveDays: null,
  activeWithinDays: null,
  joinedWithinDays: null,
  minGames: null,
  maxGames: null,
  countries: [],
};

export interface CampaignMessage {
  title: string;
  body: string;
  /** In-app route opened on tap, e.g. "/play". */
  url: string | null;
  /** Send a push to the player's phones. */
  push: boolean;
  /** Also keep a copy in the in-app notification inbox. */
  inbox: boolean;
}

export interface CampaignStats {
  /** Players matched when it went out (instant/scheduled) or fired so far (trigger). */
  targeted: number;
  /** Players who got an inbox copy. */
  inbox: number;
  /** Push messages Expo accepted. */
  pushed: number;
  /** Push messages Expo refused, or that never left. */
  failed: number;
  /** Players skipped: opted out, quiet hours, frequency cap, or no device. */
  skipped: number;
}

export const EMPTY_STATS: CampaignStats = { targeted: 0, inbox: 0, pushed: 0, failed: 0, skipped: 0 };

export interface Campaign {
  id: string;
  name: string;
  kind: CampaignKind;
  status: CampaignStatus;
  message: CampaignMessage;
  audience: CampaignAudience;
  /** When a scheduled campaign goes out (ms). */
  scheduleAt: number | null;
  trigger: CampaignTrigger | null;
  stats: CampaignStats;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
  lastError: string | null;
}

/** What the console sends to create or save a campaign. */
export interface CampaignInput {
  name: string;
  kind: CampaignKind;
  message: CampaignMessage;
  audience: CampaignAudience;
  scheduleAt: number | null;
  trigger: CampaignTrigger | null;
}

/** Push setup and delivery health, for the console. */
export interface PushHealth {
  /** Devices with push turned on, by platform. */
  devices: Record<string, number>;
  /** Players with at least one device. */
  players: number;
  /** False when the server sends no push (development, tests). */
  sending: boolean;
  /** EXPO_ACCESS_TOKEN set on the server (needed when "enhanced push security" is on in Expo). */
  accessToken: boolean;
  /** Recent delivery errors reported by Expo, newest first. */
  errors: { at: number; code: string; message: string; platform: string | null; count: number }[];
  /** Totals since the server started. */
  totals: { accepted: number; delivered: number; failed: number };
}

export class CampaignInputError extends Error {}

const TITLE_MAX = 120;
const BODY_MAX = 400;
const NAME_MAX = 80;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);

/** In-app routes are relative paths; anything else (other sites, schemes) is refused. */
export function cleanCampaignUrl(v: unknown): string | null {
  const s = str(v, 300);
  if (!s) return null;
  if (!/^\/[\w\-./?=&%#~+,:@]*$/.test(s) || s.startsWith('//')) throw new CampaignInputError('The link must be an in-app path such as /play');
  return s;
}

export function cleanAudience(v: unknown): CampaignAudience {
  const a = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const names = Array.isArray(a.usernames) ? a.usernames : typeof a.usernames === 'string' ? a.usernames.split(/[\s,]+/) : [];
  const countries = Array.isArray(a.countries) ? a.countries : typeof a.countries === 'string' ? a.countries.split(/[\s,]+/) : [];
  const minGames = int(a.minGames, 0, 1_000_000);
  const maxGames = int(a.maxGames, 0, 1_000_000);
  return {
    usernames: [...new Set(names.map((n) => str(n, 40).replace(/^@/, '')).filter(Boolean))].slice(0, 500),
    platform: oneOf(a.platform, CAMPAIGN_PLATFORMS, 'any'),
    inactiveDays: int(a.inactiveDays, 1, 3650),
    activeWithinDays: int(a.activeWithinDays, 1, 3650),
    joinedWithinDays: int(a.joinedWithinDays, 1, 3650),
    minGames,
    maxGames: maxGames !== null && minGames !== null && maxGames < minGames ? minGames : maxGames,
    countries: [...new Set(countries.map((c) => str(c, 2).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 50),
  };
}

export function cleanTrigger(v: unknown): CampaignTrigger {
  const t = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    event: oneOf(t.event, TRIGGER_EVENTS, 'left_without_playing'),
    delayMinutes: int(t.delayMinutes, 0, 60 * 24 * 30) ?? DEFAULT_TRIGGER.delayMinutes,
    days: int(t.days, 1, 365) ?? DEFAULT_TRIGGER.days,
    cooldownHours: int(t.cooldownHours, 0, 24 * 365) ?? DEFAULT_TRIGGER.cooldownHours,
    maxPerUser: int(t.maxPerUser, 0, 1000) ?? 0,
  };
}

/** Checks and trims untrusted console input. Throws CampaignInputError with a message staff can act on. */
export function cleanCampaignInput(v: unknown, now: number): CampaignInput {
  const i = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const m = (i.message && typeof i.message === 'object' ? i.message : {}) as Record<string, unknown>;
  const kind = oneOf(i.kind, CAMPAIGN_KINDS, 'instant');
  const message: CampaignMessage = {
    title: str(m.title, TITLE_MAX),
    body: str(m.body, BODY_MAX),
    url: cleanCampaignUrl(m.url),
    push: m.push !== false,
    inbox: m.inbox !== false,
  };
  if (!message.title) throw new CampaignInputError('Write a title');
  if (!message.body) throw new CampaignInputError('Write the message');
  if (!message.push && !message.inbox) throw new CampaignInputError('Pick push, inbox or both');
  let scheduleAt: number | null = null;
  if (kind === 'scheduled') {
    scheduleAt = Number(i.scheduleAt);
    if (!Number.isFinite(scheduleAt)) throw new CampaignInputError('Pick when to send it');
    if (scheduleAt < now - 60_000) throw new CampaignInputError('That time has passed');
    if (scheduleAt > now + 366 * 86_400_000) throw new CampaignInputError('Schedule it within a year');
  }
  return {
    name: str(i.name, NAME_MAX) || message.title.slice(0, NAME_MAX),
    kind,
    message,
    audience: cleanAudience(i.audience),
    scheduleAt,
    trigger: kind === 'trigger' ? cleanTrigger(i.trigger) : null,
  };
}

/**
 * Fills {username} in campaign text with the player's name, so a message can
 * read "Ready for a game, {username}?".
 */
export function personalize(text: string, vars: { username: string }): string {
  return text.replace(/\{username\}/g, vars.username);
}

/** Most campaign notifications (any campaign) one player gets in 24 hours. */
export const CAMPAIGN_DAILY_CAP = 3;
