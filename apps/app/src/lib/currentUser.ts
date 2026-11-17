/**
 * What the app shell needs to know about whoever is using the app.
 *
 * This is a stand-in until accounts land: everyone is a guest with a
 * provisional rating. The accounts work should replace the body of
 * `useCurrentUser` (e.g. read from `useAuth()` and the player's ratings) and
 * keep this return shape, so the header, sidebar and profile tab need no edits.
 */
export type CurrentUser = {
  status: 'loading' | 'guest' | 'signedIn';
  displayName: string;
  /** Rating shown in the header, or null when there is none to show. */
  rating: number | null;
  /** True while the rating is still settling (few games played). */
  provisional: boolean;
  avatarUrl: string | null;
};

const GUEST: CurrentUser = {
  status: 'guest',
  displayName: 'Guest',
  rating: 1200,
  provisional: true,
  avatarUrl: null,
};

export function useCurrentUser(): CurrentUser {
  return GUEST;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : parts[0][1] ?? '';
  return (first + second).toUpperCase();
}
