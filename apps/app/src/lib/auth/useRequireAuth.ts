import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from './AuthProvider';

/**
 * For account-only screens (profile, settings, rated games). Guests and
 * signed-out visitors are sent to sign in, then returned here.
 * Returns true once the screen may render.
 */
export function useRequireAuth(returnTo?: string): boolean {
  const { status } = useAuth();
  useEffect(() => {
    if (status === 'guest' || status === 'signedOut') {
      router.replace(returnTo ? { pathname: '/sign-in', params: { next: returnTo } } : '/sign-in');
    }
  }, [status, returnTo]);
  return status === 'signedIn';
}
