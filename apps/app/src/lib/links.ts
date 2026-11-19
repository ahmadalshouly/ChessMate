import { challengePath, profilePath } from '@chessmate/core';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

const webUrl = process.env.EXPO_PUBLIC_WEB_URL;

/**
 * Shareable link for a challenge. Prefers the public web address so the link
 * opens in a browser for people without the app (and in the app once
 * universal/app links are set up for that domain). Falls back to the current
 * web origin, then to the app's own deep link (chessmate:// in builds,
 * exp://<lan-ip>:8081/--/ in Expo Go).
 */
export function challengeLink(id: string): string {
  const path = challengePath(id);
  if (typeof webUrl === 'string' && webUrl.length > 0) return `${webUrl.replace(/\/+$/, '')}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${path}`;
  return Linking.createURL(path.slice(1));
}

/** Shareable link to a player's profile (what their QR code holds). Same host rules as challengeLink. */
export function profileLink(username: string): string {
  const path = profilePath(username);
  if (typeof webUrl === 'string' && webUrl.length > 0) return `${webUrl.replace(/\/+$/, '')}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${path}`;
  return Linking.createURL(path.slice(1));
}

/** Opens the native share sheet, or copies to the clipboard on desktop browsers. Returns what happened. */
export async function shareLink(url: string, message: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : undefined;
      if (nav?.share) {
        await nav.share({ title: 'ChessMate', text: message, url });
        return 'shared';
      }
      if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
        return 'copied';
      }
      return 'failed';
    }
    await Share.share(Platform.OS === 'ios' ? { message, url } : { message: `${message} ${url}` });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** Copies text where the platform allows it without extra native modules (web only for now). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}
