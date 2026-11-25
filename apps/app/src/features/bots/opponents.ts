import {
  BOT_BANDS,
  BOTS,
  botBandOf,
  clampBotRating,
  type BotBandId,
  type BotPersona,
  type BotProfile,
  type OnlineBot,
  type OnlineBotTag,
} from '@chessmate/core';

import { botAvatarUrl } from '../../lib/botsApi';

/**
 * Everyone the player can choose from on the vs-computer screen: the built-in
 * bots that ship with the app, and the online ones staff add in the console.
 * Both play the same way (see botMove.ts); only where they come from differs.
 */
export interface Opponent extends BotPersona {
  kind: 'builtin' | 'online';
  band: BotBandId;
  /** Monogram for the avatar when there is no picture. */
  initial: string;
  /** Online bots bring their own line; built-in ones are translated (`bots.taglines.<id>`). */
  tagline: string | null;
  /** Absolute URL of the picture, online bots only. */
  avatar: string | null;
  /** The person's channel or page, online bots only. */
  url: string | null;
  tag: OnlineBotTag | null;
  featured: boolean;
}

export function builtinOpponent(b: BotProfile): Opponent {
  return { ...b, kind: 'builtin', band: botBandOf(b.rating), tagline: null, avatar: null, url: null, tag: null, featured: false };
}

export function onlineOpponent(b: OnlineBot): Opponent {
  const rating = clampBotRating(b.rating);
  return {
    // Never clashes with a built-in id, so a remembered choice can't pick the wrong bot.
    id: `online:${b.id}`,
    kind: 'online',
    name: b.name,
    rating,
    style: b.style,
    band: botBandOf(rating),
    initial: (b.name.trim()[0] ?? '?').toUpperCase(),
    tagline: b.tagline,
    avatar: botAvatarUrl(b.avatar),
    url: b.url,
    tag: b.tag,
    featured: b.featured,
  };
}

/** The server id of an online opponent, or null for a built-in one. */
export function onlineBotId(o: Pick<Opponent, 'id' | 'kind'>): string | null {
  return o.kind === 'online' ? o.id.slice('online:'.length) : null;
}

export const BUILTIN_OPPONENTS: readonly Opponent[] = BOTS.map(builtinOpponent);

/** Every opponent, weakest first; at equal ratings an online bot comes first. */
export function allOpponents(online: readonly OnlineBot[]): Opponent[] {
  return [...BUILTIN_OPPONENTS, ...online.map(onlineOpponent)].sort((a, b) => a.rating - b.rating || (a.kind === b.kind ? 0 : a.kind === 'online' ? -1 : 1));
}

/** Opponents grouped by rating band, in band order; empty bands are kept so the picker's tabs never move. */
export function byBand(all: readonly Opponent[]): { band: (typeof BOT_BANDS)[number]; opponents: Opponent[] }[] {
  return BOT_BANDS.map((band) => ({ band, opponents: all.filter((o) => o.band === band.id) }));
}

/** A sensible first opponent: the built-in bot closest to the player's rating, or Marlow (about 1000). */
export function defaultOpponent(playerRating: number | null): Opponent {
  if (playerRating == null) return BUILTIN_OPPONENTS.find((o) => o.id === 'marlow') ?? BUILTIN_OPPONENTS[0]!;
  return BUILTIN_OPPONENTS.reduce((best, o) => (Math.abs(o.rating - playerRating) < Math.abs(best.rating - playerRating) ? o : best));
}
