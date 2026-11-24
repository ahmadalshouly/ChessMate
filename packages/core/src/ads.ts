/**
 * Sponsored spots: the contract shared by the server (/api/ads, /api/admin/ads)
 * and the app.
 *
 * A **spot** is a fixed place in the app that can carry a sponsor. The list is
 * closed and lives here, so the app and the console always agree on which
 * places exist. Staff switch each spot on or off; a spot that is off, or that
 * has no live placement, renders nothing at all.
 *
 * A **placement** puts one sponsor on one spot for a period: a title, a line of
 * text, an optional image and an optional link. It goes live at `startsAt` and
 * stops by itself at `endsAt`, so nobody has to remember to take it down.
 *
 * Companies reach this through a sponsor application (see `tournaments.ts`);
 * staff review it, ask for material, and then place it on a spot.
 */

import { cleanImage } from './media';

export const AD_SPOTS = [
  'home.feed',
  'play.lobby',
  'game.start',
  'game.over',
  'tournaments.list',
  'puzzles.home',
  'watch.home',
  'learn.list',
] as const;

export type AdSpotId = (typeof AD_SPOTS)[number];

/**
 * Where each spot sits and the shape it wants, for the console's spot list.
 * `wide` spots run the full width of a content column and suit a banner;
 * `card` spots sit among other cards and suit a logo with a line of text;
 * `compact` spots are a single small line on a crowded card, where only the
 * logo, the title and the sponsor's name fit.
 */
export const AD_SPOT_INFO: Record<AdSpotId, { form: 'wide' | 'card' | 'compact' }> = {
  'home.feed': { form: 'wide' },
  'play.lobby': { form: 'card' },
  'game.start': { form: 'compact' },
  'game.over': { form: 'compact' },
  'tournaments.list': { form: 'wide' },
  'puzzles.home': { form: 'card' },
  'watch.home': { form: 'wide' },
  'learn.list': { form: 'card' },
};

export function isAdSpot(v: unknown): v is AdSpotId {
  return typeof v === 'string' && (AD_SPOTS as readonly string[]).includes(v);
}

export const AD_LIMITS = {
  titleMax: 60,
  bodyMax: 160,
  sponsorMax: 60,
  urlMax: 500,
  /** Longest period a single placement may run, in days. */
  maxDays: 400,
} as const;

/** The periods the console offers as one tap; staff can also pick dates. */
export const AD_PERIODS = [
  { key: 'week', days: 7 },
  { key: 'fortnight', days: 14 },
  { key: 'month', days: 30 },
  { key: 'quarter', days: 90 },
] as const;

export type AdPeriodKey = (typeof AD_PERIODS)[number]['key'];

/** What a spot's switch looks like in the console. */
export interface AdSpotState {
  spot: AdSpotId;
  enabled: boolean;
  /** Staff's own note about the spot, e.g. what it sells for. */
  note: string | null;
  updatedBy: string | null;
  updatedAt: number | null;
}

export interface AdPlacementInput {
  spot: AdSpotId;
  /** The company's name, shown as "Sponsored by ...". */
  sponsor: string;
  title: string;
  body: string | null;
  /** Where tapping the spot goes. Null makes the spot a plain notice. */
  url: string | null;
  /** A data URL to store, null to remove it, undefined to keep what is there. */
  image?: string | null;
  /** An image already on the web, used when no image was uploaded. */
  imageUrl: string | null;
  startsAt: number;
  endsAt: number;
  /** The sponsor application this came from, when it came from one. */
  applicationId: string | null;
}

/** A placement as the console lists it. */
export interface AdPlacementView extends Omit<AdPlacementInput, 'image'> {
  id: string;
  /** Path of the stored image on the server, when one was uploaded. */
  imagePath: string | null;
  /** Taken down by hand before its end. */
  stopped: boolean;
  createdBy: string | null;
  createdAt: number;
  /** Taps counted on the spot. */
  clicks: number;
  /** Times the spot was shown. */
  impressions: number;
}

/** What the app gets for a spot: only ever a live placement, never the admin side. */
export interface AdCreative {
  id: string;
  spot: AdSpotId;
  sponsor: string;
  title: string;
  body: string | null;
  url: string | null;
  /** The image to show: an absolute URL, or a server path for an uploaded one. */
  image: string | null;
  endsAt: number;
}

/** True while the placement should be on screen. */
export function isLive(p: { startsAt: number; endsAt: number; stopped: boolean }, now: number): boolean {
  return !p.stopped && p.startsAt <= now && p.endsAt > now;
}

export type AdPlacementStatus = 'scheduled' | 'live' | 'ended' | 'stopped';

export function placementStatus(p: { startsAt: number; endsAt: number; stopped: boolean }, now: number): AdPlacementStatus {
  if (p.stopped) return 'stopped';
  if (p.startsAt > now) return 'scheduled';
  return p.endsAt > now ? 'live' : 'ended';
}

type Clean<T> = { value: T } | { error: string; field: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** An https link, http upgraded. Empty means "no link". */
function cleanUrl(raw: unknown, field: string): Clean<string | null> {
  const s = str(raw, AD_LIMITS.urlMax);
  if (!s) return { value: null };
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) throw new Error('no host');
    if (u.protocol === 'http:') u.protocol = 'https:';
    return { value: u.toString() };
  } catch {
    return { error: 'Enter a valid link, such as https://example.com', field };
  }
}

/**
 * Checks a placement from the console. `now` is the server clock, used to
 * default the start to right away.
 */
export function validateAdPlacement(input: unknown, now: number): Clean<AdPlacementInput> {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (!isAdSpot(i.spot)) return { error: 'Pick a spot', field: 'spot' };

  const sponsor = str(i.sponsor, AD_LIMITS.sponsorMax);
  if (sponsor.length < 2) return { error: 'Name the sponsor', field: 'sponsor' };
  const title = str(i.title, AD_LIMITS.titleMax);
  if (title.length < 2) return { error: 'Add a title, such as "Sponsor of the week"', field: 'title' };
  const body = str(i.body, AD_LIMITS.bodyMax) || null;

  const url = cleanUrl(i.url, 'url');
  if ('error' in url) return url;
  const imageUrl = cleanUrl(i.imageUrl, 'imageUrl');
  if ('error' in imageUrl) return imageUrl;

  const image = cleanImage(i.image, 'image');
  if ('error' in image) return { error: image.error, field: image.field ?? 'image' };

  const startsAt = typeof i.startsAt === 'number' && Number.isFinite(i.startsAt) ? Math.round(i.startsAt) : now;
  let endsAt: number;
  if (typeof i.endsAt === 'number' && Number.isFinite(i.endsAt)) {
    endsAt = Math.round(i.endsAt);
  } else {
    const period = AD_PERIODS.find((p) => p.key === i.period);
    if (!period) return { error: 'Choose how long it runs', field: 'endsAt' };
    endsAt = startsAt + period.days * 86_400_000;
  }
  if (endsAt <= startsAt) return { error: 'The end must come after the start', field: 'endsAt' };
  if (endsAt - startsAt > AD_LIMITS.maxDays * 86_400_000) return { error: `A placement can run for at most ${AD_LIMITS.maxDays} days`, field: 'endsAt' };

  const applicationId = typeof i.applicationId === 'string' && i.applicationId.trim() ? i.applicationId.trim() : null;

  return {
    value: {
      spot: i.spot,
      sponsor,
      title,
      body,
      url: url.value,
      imageUrl: imageUrl.value,
      ...(image.value !== undefined ? { image: image.value } : {}),
      startsAt,
      endsAt,
      applicationId,
    },
  };
}
