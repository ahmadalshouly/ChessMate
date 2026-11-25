/**
 * Online computer opponents: bots that staff create in the admin console with
 * their own name, picture, rating, style and link, for example a bot in the
 * name of a streamer or a creator ChessMate works with. The contract shared by
 * the server (/api/bots, /api/admin/bots) and the app.
 *
 * They play exactly like built-in bots of the same rating and style (the
 * moves come from the player's own device), but the list of them lives on the
 * server, so they only appear while the app is online. Nothing about them is
 * kept on the device: a bot staff switch off disappears on the next refresh.
 */

import { cleanImage, cleanWebLink } from '../media';
import type { RoleTag } from '../roleTags';
import { BOT_RATING_MAX, BOT_RATING_MIN, isBotStyle, type BotStyle } from './bots';

/** The badges an online bot can carry, named like the official role tags. */
export const ONLINE_BOT_TAGS = ['streamer', 'creator', 'coach', 'ambassador'] as const satisfies readonly RoleTag[];
export type OnlineBotTag = (typeof ONLINE_BOT_TAGS)[number];

export function isOnlineBotTag(v: unknown): v is OnlineBotTag {
  return typeof v === 'string' && (ONLINE_BOT_TAGS as readonly string[]).includes(v);
}

export const ONLINE_BOT_LIMITS = {
  nameMax: 30,
  taglineMax: 140,
  urlMax: 500,
  /** Bots the console can hold, live or not. */
  max: 200,
} as const;

/** How a game against a bot ended, from the player's side. */
export const BOT_GAME_RESULTS = ['win', 'loss', 'draw'] as const;
export type BotGameResult = (typeof BOT_GAME_RESULTS)[number];

export interface OnlineBotInput {
  name: string;
  /** One line under the name, in the bot's own voice. */
  tagline: string | null;
  rating: number;
  style: BotStyle;
  tag: OnlineBotTag | null;
  /** Where "Visit" goes: the person's channel or page. */
  url: string | null;
  /** A data URL to store, null to remove it, undefined to keep what is there. */
  image?: string | null;
  /** A picture already on the web, used when none was uploaded. */
  imageUrl: string | null;
  /** Shown first, at the top of the opponent picker. */
  featured: boolean;
  /** Off hides the bot from players without deleting it. */
  enabled: boolean;
}

/** What players see. Only enabled bots are ever sent. */
export interface OnlineBot {
  id: string;
  name: string;
  tagline: string | null;
  rating: number;
  style: BotStyle;
  tag: OnlineBotTag | null;
  url: string | null;
  /** The picture: an absolute URL, or a server path for an uploaded one. */
  avatar: string | null;
  featured: boolean;
}

/** A bot as the console lists it, with how often it has been played. */
export interface OnlineBotView extends Omit<OnlineBotInput, 'image'> {
  id: string;
  /** Path of the uploaded picture on the server, when there is one. */
  imagePath: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number | null;
  /** Finished games against it, and how they went for the players. */
  games: number;
  playerWins: number;
  botWins: number;
  draws: number;
}

type Clean<T> = { value: T } | { error: string; field: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Checks a bot from the console. */
export function validateOnlineBot(input: unknown): Clean<OnlineBotInput> {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const name = str(i.name, ONLINE_BOT_LIMITS.nameMax);
  if (name.length < 2) return { error: 'Give the bot a name', field: 'name' };
  const tagline = str(i.tagline, ONLINE_BOT_LIMITS.taglineMax) || null;

  const rating = typeof i.rating === 'number' ? i.rating : typeof i.rating === 'string' ? Number(i.rating) : NaN;
  if (!Number.isFinite(rating) || rating < BOT_RATING_MIN || rating > BOT_RATING_MAX) {
    return { error: `The rating must be between ${BOT_RATING_MIN} and ${BOT_RATING_MAX}`, field: 'rating' };
  }
  const style = i.style === undefined || i.style === null ? 'balanced' : i.style;
  if (!isBotStyle(style)) return { error: 'Pick a playing style', field: 'style' };
  const tag = i.tag === undefined || i.tag === null || i.tag === '' ? null : i.tag;
  if (tag !== null && !isOnlineBotTag(tag)) return { error: 'Pick a badge', field: 'tag' };

  const url = cleanWebLink(i.url, 'url', ONLINE_BOT_LIMITS.urlMax);
  if ('error' in url) return { error: url.error, field: 'url' };
  const imageUrl = cleanWebLink(i.imageUrl, 'imageUrl', ONLINE_BOT_LIMITS.urlMax);
  if ('error' in imageUrl) return { error: imageUrl.error, field: 'imageUrl' };
  const image = cleanImage(i.image, 'image');
  if ('error' in image) return { error: image.error, field: image.field ?? 'image' };

  return {
    value: {
      name,
      tagline,
      rating: Math.round(rating),
      style,
      tag,
      url: url.value,
      imageUrl: imageUrl.value,
      ...(image.value !== undefined ? { image: image.value } : {}),
      featured: i.featured === true,
      enabled: i.enabled !== false,
    },
  };
}

export function isBotGameResult(v: unknown): v is BotGameResult {
  return typeof v === 'string' && (BOT_GAME_RESULTS as readonly string[]).includes(v);
}
