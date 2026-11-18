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
