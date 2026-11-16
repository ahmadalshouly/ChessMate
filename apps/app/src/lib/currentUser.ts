import { DEFAULT_RATING } from '@chessmate/core';

import { useAuth } from '@/lib/auth';

/**
 * What the app shell needs to know about whoever is using the app.
 *
 * Keep this return shape stable: the header, sidebar and profile tab read it.
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

/**
 * Backed by the auth session. Ratings come from the rating service once it is
 * wired in; until then everyone shows the provisional starting rating.
 */
export function useCurrentUser(): CurrentUser {
  const { status, user, guestName } = useAuth();
  if (status === 'loading') return { status: 'loading', displayName: '', rating: null, provisional: true, avatarUrl: null };
  if (status === 'signedIn' && user) {
    return { status: 'signedIn', displayName: user.username, rating: Math.round(DEFAULT_RATING.rating), provisional: true, avatarUrl: null };
  }
  return { status: 'guest', displayName: guestName ?? 'Guest', rating: null, provisional: true, avatarUrl: null };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : parts[0][1] ?? '';
  return (first + second).toUpperCase();
}
