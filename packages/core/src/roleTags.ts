/**
 * Role tags: a small official marker next to a player's name ("ChessMate
 * staff", "Streamer", "Coach"). Only admins can give or take one away, from
 * the admin console, so players can trust them. A player has at most one.
 *
 * These are separate from verified chess titles (GM, IM, ...) and from any
 * decoration players pick for themselves.
 */
export const ROLE_TAGS = ['staff', 'moderator', 'streamer', 'coach', 'arbiter', 'creator', 'ambassador'] as const;
export type RoleTag = (typeof ROLE_TAGS)[number];

export function isRoleTag(v: unknown): v is RoleTag {
  return typeof v === 'string' && (ROLE_TAGS as readonly string[]).includes(v);
}

/** English names; the app translates them under `roleTag.names`. */
export const ROLE_TAG_LABELS: Record<RoleTag, string> = {
  staff: 'ChessMate staff',
  moderator: 'Moderator',
  streamer: 'Streamer',
  coach: 'Coach',
  arbiter: 'Arbiter',
  creator: 'Content creator',
  ambassador: 'Ambassador',
};

/**
 * Tags players pick for themselves on their profile ("Tactician", "Night owl").
 * A different list from the official role tags above, so nobody can pose as staff.
 */
export const PLAYER_TAGS = ['learner', 'casual', 'competitive', 'tactician', 'positional', 'endgame', 'openings', 'speed', 'nightOwl', 'puzzles', 'coachable', 'veteran'] as const;
export type PlayerTag = (typeof PLAYER_TAGS)[number];

export function isPlayerTag(v: unknown): v is PlayerTag {
  return typeof v === 'string' && (PLAYER_TAGS as readonly string[]).includes(v);
}

/** Path of a player's shareable profile link (what the profile QR code opens). */
export function profilePath(username: string): string {
  return `/u/${encodeURIComponent(username)}`;
}

/** Username from a scanned or pasted profile link (or a plain username), or null. */
export function usernameFromLink(text: string): string | null {
  const t = text.trim();
  const m = /(?:^|\/)u\/([A-Za-z0-9_-]{2,30})(?:[/?#].*)?$/.exec(t);
  if (m) return m[1]!;
  if (/^@?[A-Za-z0-9_-]{2,30}$/.test(t)) return t.replace(/^@/, '');
  return null;
}
