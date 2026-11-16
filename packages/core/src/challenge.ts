import type { PlayerInfo } from './protocol';
import type { TimeControl } from './timeControl';
import type { Color } from './types';

/** Colour the challenger wants to play. */
export type ChallengeColor = Color | 'random';

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

/**
 * A game proposal from one player. With `to` set it is a direct challenge to
 * that player; without it, it is an open invite that anyone holding the link
 * can accept.
 */
export interface Challenge {
  id: string;
  from: PlayerInfo;
  /** Target player for a direct challenge, null for an open invite link. */
  to: PlayerInfo | null;
  timeControl: TimeControl;
  rated: boolean;
  color: ChallengeColor;
  status: ChallengeStatus;
  createdAt: number;
  expiresAt: number;
  /** Game created when the challenge was accepted. */
  gameId?: string;
}

export type ChallengeEndReason = 'declined' | 'cancelled' | 'expired' | 'accepted';

/** Challenge ids are short, URL-safe and hard to guess (they act as the invite secret). */
export const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

export function isChallengeId(id: unknown): id is string {
  return typeof id === 'string' && CHALLENGE_ID_PATTERN.test(id);
}

/** In-app path for a challenge; also the web path, so one link works everywhere. */
export function challengePath(id: string): string {
  return `/challenge/${encodeURIComponent(id)}`;
}

/**
 * Builds a shareable invite link. `base` is the public web origin
 * (https://chessmate.example) or an app deep-link prefix (chessmate://).
 */
export function inviteUrl(base: string, id: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\/$/i.test(base)) return `${base}${challengePath(id).slice(1)}`;
  return `${base.replace(/\/+$/, '')}${challengePath(id)}`;
}

/**
 * Extracts a challenge id from anything a user might paste: a full web link,
 * a chessmate:// deep link, an Expo Go link (exp://host/--/challenge/id), or
 * the bare id.
 */
export function parseInvite(input: string): string | null {
  const s = input.trim();
  if (isChallengeId(s)) return s;
  const m = /(?:^|\/)challenge\/([A-Za-z0-9_-]{8,32})(?:[/?#]|$)/.exec(s);
  return m ? m[1]! : null;
}

/** Resolves the requested colour to the challenger's actual colour. */
export function resolveChallengeColor(color: ChallengeColor, random: () => number = Math.random): Color {
  if (color === 'w' || color === 'b') return color;
  return random() < 0.5 ? 'w' : 'b';
}

export function describeChallengeColor(color: ChallengeColor): string {
  return color === 'w' ? 'White' : color === 'b' ? 'Black' : 'Random colour';
}
