import type { Href } from 'expo-router';

/** Only follow in-app paths after sign-in, never an absolute or protocol-relative URL. */
export function safeNext(next: string | string[] | undefined): Href {
  const v = Array.isArray(next) ? next[0] : next;
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('://')) return v as Href;
  return '/';
}
