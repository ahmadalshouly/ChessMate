/**
 * Analytics contract, shared by the app (which sends events), the server
 * (which stores them for the admin console) and the console itself.
 *
 * Events are a closed set so the app, the server and the dashboard cannot
 * disagree, and so nothing free-form (a chat line, an email) can end up in an
 * event by accident. The same names go to Google Analytics (GA4 on the web,
 * Firebase Analytics in the apps), so they follow GA's rules: snake_case,
 * at most 40 characters, and none of Firebase's reserved names (`ad_click`,
 * `session_start`, `first_open`, ...).
 *
 * Nothing is sent before the visitor allows analytics (cookie consent,
 * category "analytics"). Facts the server already has (sign-ups, games,
 * puzzles, reviews) are counted from the database instead, so those numbers
 * are complete whether or not someone consented.
 */

export const ANALYTICS_EVENTS = [
  /** The app was opened or came back to the front. props: lang, theme */
  'app_open',
  /** A screen was shown. Uses the route pattern (`/game/[id]`), never ids. */
  'screen_view',
  /** props: method (email | google | apple) */
  'sign_up',
  /** props: method (email | google | apple | guest) */
  'login',
  'logout',
  /** An online game began. props: time_control (e.g. 3+2), category, rated */
  'game_start',
  /** props: result (win | loss | draw | aborted), reason, category */
  'game_end',
  /** A game against the computer began. props: level */
  'computer_game_start',
  /** Review opened. props: deep (true for a deep review) */
  'review_open',
  /** One puzzle finished. props: solved, rated */
  'puzzle_attempt',
  /** props: lesson */
  'lesson_open',
  /** Share sheet used. props: method (copy_pgn | link | collection) */
  'share',
  'tournament_join',
  /** A sponsor spot was tapped. props: spot */
  'sponsor_click',
  /** Donate button pressed. props: amount */
  'donate_start',
  /** props: lang */
  'language_change',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const EVENT_SET: ReadonlySet<string> = new Set(ANALYTICS_EVENTS);
export const isAnalyticsEvent = (v: unknown): v is AnalyticsEventName => typeof v === 'string' && EVENT_SET.has(v);

export type AnalyticsPlatform = 'web' | 'ios' | 'android';
export const ANALYTICS_PLATFORMS: readonly AnalyticsPlatform[] = ['web', 'ios', 'android'];

/** Small, flat values only: no objects, no long text. */
export type AnalyticsProps = Record<string, string | number | boolean>;

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  /** Milliseconds since the epoch, on the device. */
  at: number;
  /** Route pattern of the screen it happened on. */
  screen?: string;
  props?: AnalyticsProps;
}

/** What the app posts to /api/events. */
export interface AnalyticsBatch {
  /** Random id made on this device after consent; deleted when consent is withdrawn. */
  deviceId: string;
  /** Random id per visit (new after 30 minutes in the background). */
  sessionId: string;
  platform: AnalyticsPlatform;
  appVersion?: string;
  lang?: string;
  events: AnalyticsEventInput[];
}

export const ANALYTICS_MAX_BATCH = 50;
export const ANALYTICS_MAX_PROPS = 8;
const MAX_KEY = 40;
const MAX_VALUE = 100;
/** Ids from the device: our own random ids only (uuid-ish), nothing an attacker can stuff text into. */
const ID = /^[A-Za-z0-9-]{8,64}$/;
const SCREEN = /^\/[A-Za-z0-9_/[\]().-]{0,120}$/;
const KEY = /^[a-z][a-z0-9_]*$/;

/** Keeps only short, flat props with snake_case keys. */
export function cleanAnalyticsProps(raw: unknown): AnalyticsProps | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: AnalyticsProps = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= ANALYTICS_MAX_PROPS) break;
    if (k.length > MAX_KEY || !KEY.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, MAX_VALUE);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else continue;
    n++;
  }
  return n ? out : undefined;
}

/**
 * Checks a batch from the app. Unknown events, bad ids and odd values are
 * dropped rather than failing the whole batch; events dated more than a day
 * away from `now` (a wrong device clock) are moved to `now`.
 */
export function parseAnalyticsBatch(raw: unknown, now = Date.now()): AnalyticsBatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.deviceId !== 'string' || !ID.test(b.deviceId)) return null;
  if (typeof b.sessionId !== 'string' || !ID.test(b.sessionId)) return null;
  if (!ANALYTICS_PLATFORMS.includes(b.platform as AnalyticsPlatform)) return null;
  if (!Array.isArray(b.events)) return null;
  const DAY = 24 * 3600_000;
  const events: AnalyticsEventInput[] = [];
  for (const e of b.events.slice(0, ANALYTICS_MAX_BATCH)) {
    if (!e || typeof e !== 'object') continue;
    const ev = e as Record<string, unknown>;
    if (!isAnalyticsEvent(ev.name)) continue;
    const at = typeof ev.at === 'number' && Math.abs(ev.at - now) < DAY ? Math.round(ev.at) : now;
    const screen = typeof ev.screen === 'string' && SCREEN.test(ev.screen) ? ev.screen : undefined;
    events.push({ name: ev.name, at, ...(screen ? { screen } : null), ...(cleanAnalyticsProps(ev.props) ? { props: cleanAnalyticsProps(ev.props) } : null) });
  }
  const short = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);
  return {
    deviceId: b.deviceId,
    sessionId: b.sessionId,
    platform: b.platform as AnalyticsPlatform,
    appVersion: short(b.appVersion, 20),
    lang: short(b.lang, 12),
    events,
  };
}

/**
 * The screen name for analytics from Expo Router's segments: groups such as
 * `(tabs)` are dropped and dynamic parts stay as their pattern (`[id]`), so no
 * game, player or message id ever reaches an analytics service.
 */
export function analyticsScreenName(segments: readonly string[]): string {
  const parts = segments.filter((s) => s && !(s.startsWith('(') && s.endsWith(')')));
  if (parts[parts.length - 1] === 'index') parts.pop();
  return `/${parts.join('/')}`;
}

// ---------------------------------------------------------------- admin dashboard

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export interface AnalyticsCount {
  key: string;
  count: number;
  /** Distinct devices, where it applies. */
  devices?: number;
}

export interface AnalyticsDay {
  day: string;
  /** From the database (every player, no consent needed). */
  signups: number;
  games: number;
  players: number;
  puzzles: number;
  reviews: number;
  /** From app events (only visitors who allowed analytics). */
  devices: number;
  sessions: number;
}

export interface AnalyticsRecentEvent {
  at: number;
  name: AnalyticsEventName;
  platform: AnalyticsPlatform;
  screen: string | null;
  props: AnalyticsProps | null;
  username: string | null;
}

/** GET /api/admin/analytics?days=7|30|90 */
export interface AnalyticsReport {
  days: AnalyticsRange;
  generatedAt: number;
  live: { playersOnline: number; gamesInProgress: number; playersSeeking: number };
  /** Accounts seen in the last day, week and month (any device, from the database). */
  active: { day: number; week: number; month: number; total: number };
  totals: {
    signups: number;
    games: number;
    ratedGames: number;
    puzzles: number;
    puzzlesSolved: number;
    reviews: number;
    tournamentJoins: number;
    messages: number;
  };
  /** Of the accounts made in the period: how many came back after a day, and after a week. */
  retention: { cohort: number; day1: number; day7: number };
  signupMethods: AnalyticsCount[];
  timeCategories: AnalyticsCount[];
  openings: AnalyticsCount[];
  countries: AnalyticsCount[];
  daily: AnalyticsDay[];
  /** Everything below comes from consented app events only. */
  app: {
    devices: number;
    sessions: number;
    events: number;
    /** Median session length, in seconds. */
    medianSessionSeconds: number;
    platforms: AnalyticsCount[];
    screens: AnalyticsCount[];
    topEvents: AnalyticsCount[];
    versions: AnalyticsCount[];
    languages: AnalyticsCount[];
    /** Devices that opened the app, signed up, started a game and finished one, in the period. */
    funnel: { opened: number; signedUp: number; startedGame: number; finishedGame: number };
    recent: AnalyticsRecentEvent[];
  };
  /** Sponsor spots: impressions and taps over all time, per spot. */
  sponsors: { spot: string; impressions: number; clicks: number }[];
}

/** Days kept in analytics_events before they are deleted (GA4's longest setting is 14 months). */
export const ANALYTICS_RETENTION_DAYS = 400;
