import { router, type Href } from 'expo-router';

/** Only follow in-app paths after sign-in, never an absolute or protocol-relative URL. */
export function safeNext(next: string | string[] | undefined): Href {
  const v = Array.isArray(next) ? next[0] : next;
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('://')) return v as Href;
  return '/';
}

/**
 * Leave the auth screens after signing in or up. Pops back to `next` when it is already
 * open underneath (for example the Profile tab that sent the player here), otherwise
 * replaces the auth screen with it. Replacing alone stacked a second copy of the tabs on
 * top, which on iPhone left Profile showing the signed-out card.
 */
export function leaveAuth(next: string | string[] | undefined): void {
  router.dismissTo(safeNext(next));
}
