import { router, type Href } from 'expo-router';

/**
 * Go back one screen, or open `fallback` when there is nothing to go back to.
 *
 * A screen can be the only one in history: opened from a notification or link,
 * on a fresh launch, or after a `replace`. A bare `router.back()` there does
 * nothing and logs "The action 'GO_BACK' was not handled by any navigator".
 */
export function goBack(fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
