import { FOOTBALL_CLUBS, countryName, type FootballClub } from '@chessmate/core';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Football Mate club logos, looked up from TheSportsDB (https://www.thesportsdb.com).
 *
 * The server searches TheSportsDB once per club, a few seconds apart to stay under the
 * free tier's rate limit, keeps the badge URL for each club it finds, and serves the
 * whole map at GET /api/football/logos. The app shows the logo image from that URL and
 * falls back to the club's colour shield for any club without one (not found yet, the
 * lookup failed, or logos are switched off).
 *
 * Environment:
 *   FOOTBALL_LOGOS=off              no lookups, every badge is the colour shield
 *   FOOTBALL_LOGO_API_KEY=<key>     TheSportsDB key (default: the public test key "123")
 *
 * Crests are the clubs' trademarks; TheSportsDB hosts the images but grants no rights in them.
 */

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LogoServiceOptions {
  apiKey?: string;
  fetch?: Fetcher;
  /** Pause between lookups, ms. The free tier allows about 30 requests a minute. */
  gapMs?: number;
  /** Look clubs up again after this long, ms (badges rarely change). */
  refreshMs?: number;
  clubs?: readonly FootballClub[];
  log?: (msg: string) => void;
}

interface SportsDbTeam {
  strTeam?: string | null;
  strTeamAlternate?: string | null;
  strSport?: string | null;
  strCountry?: string | null;
  strBadge?: string | null;
  strTeamBadge?: string | null;
}

/** TheSportsDB's country names where they differ from ours (ISO code -> names it uses). */
const SPORTSDB_COUNTRIES: Record<string, string[]> = {
  GB: ['England', 'Scotland', 'Wales', 'United Kingdom'],
  US: ['USA', 'United States'],
  TR: ['Turkey', 'Türkiye'],
};

/** Search terms where the club's display name doesn't find it on TheSportsDB. */
const SEARCH_NAMES: Record<string, string> = {
  inter: 'Inter Milan',
  'al-ahli-sa': 'Al-Ahli',
  'al-hilal': 'Al-Hilal',
  'al-nassr': 'Al-Nassr',
  'al-ittihad': 'Al-Ittihad',
  psg: 'Paris SG',
  'atletico-madrid': 'Atletico Madrid',
  bayern: 'Bayern Munich',
  gladbach: 'Borussia Monchengladbach',
  fenerbahce: 'Fenerbahce',
  besiktas: 'Besiktas',
};

export class FootballLogoService {
  private logos = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly apiKey: string;
  private readonly fetch: Fetcher;
  private readonly gapMs: number;
  private readonly refreshMs: number;
  private readonly clubs: readonly FootballClub[];
  private readonly log: (msg: string) => void;

  constructor(opts: LogoServiceOptions = {}) {
    this.apiKey = opts.apiKey || '123';
    this.fetch = opts.fetch ?? ((u) => fetch(u));
    this.gapMs = opts.gapMs ?? 2500;
    this.refreshMs = opts.refreshMs ?? 7 * 24 * 3600_000;
    this.clubs = opts.clubs ?? FOOTBALL_CLUBS;
    this.log = opts.log ?? ((m) => console.log(m));
  }

  /** Club id -> logo URL, for the clubs found so far. */
  all(): Record<string, string> {
    return Object.fromEntries(this.logos);
  }

  /** Looks every club up now, then again every refresh period. */
  start() {
    const run = async () => {
      await this.refresh();
      if (this.stopped) return;
      this.timer = setTimeout(() => void run(), this.refreshMs);
      this.timer.unref?.();
    };
    void run();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** One pass over every club. Clubs that fail keep the logo they had. */
  async refresh(): Promise<void> {
    let found = 0;
    for (const [i, club] of this.clubs.entries()) {
      if (this.stopped) return;
      if (i > 0 && this.gapMs > 0) await sleep(this.gapMs);
      try {
        const url = await this.lookup(club);
        if (url) {
          this.logos.set(club.id, url);
          found++;
        }
      } catch (e) {
        this.log(`football logos: ${club.id} lookup failed (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    this.log(`football logos: ${found} of ${this.clubs.length} clubs have a logo`);
  }

  async lookup(club: FootballClub): Promise<string | null> {
    const q = SEARCH_NAMES[club.id] ?? club.name;
    const res = await this.fetch(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(this.apiKey)}/searchteams.php?t=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { teams?: SportsDbTeam[] | null } | null;
    return pickBadge(club, q, data?.teams ?? []);
  }
}

/**
 * The best team in a search result: a football (soccer) team from the club's country,
 * preferring an exact name match. Returns its badge URL, or null when nothing fits.
 */
export function pickBadge(club: FootballClub, query: string, teams: SportsDbTeam[]): string | null {
  const countries = (SPORTSDB_COUNTRIES[club.country] ?? [countryName(club.country) ?? '']).map(fold);
  const names = [query, club.name].map(fold);
  const candidates = teams.filter((t) => fold(t.strSport ?? '') === 'soccer' && countries.includes(fold(t.strCountry ?? '')) && badgeOf(t));
  const exact = candidates.find((t) => [t.strTeam, ...(t.strTeamAlternate ?? '').split(',')].some((n) => names.includes(fold(n ?? ''))));
  const team = exact ?? candidates[0];
  return team ? badgeOf(team) : null;
}

function badgeOf(t: SportsDbTeam): string | null {
  const url = t.strBadge || t.strTeamBadge;
  return url && /^https:\/\//.test(url) ? url : null;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Logo service from the environment, or null when FOOTBALL_LOGOS=off. */
export function footballLogosFromEnv(): FootballLogoService | null {
  if (process.env.FOOTBALL_LOGOS === 'off') return null;
  return new FootballLogoService({ apiKey: process.env.FOOTBALL_LOGO_API_KEY });
}

/** GET /api/football/logos -> { logos: { [clubId]: url } }. Empty when logos are off. */
export function footballLogoRoutes(service: FootballLogoService | null) {
  return (req: IncomingMessage, res: ServerResponse, url: URL): boolean => {
    if (url.pathname !== '/api/football/logos') return false;
    res.setHeader('access-control-allow-origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-methods': 'GET, OPTIONS' }).end();
      return true;
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return true;
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end(JSON.stringify({ logos: service?.all() ?? {} }));
    return true;
  };
}
