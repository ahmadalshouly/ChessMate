import { challengePath, pathWithQuery, profilePath, type AppPath } from '@chessmate/core';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

const webUrl = process.env.EXPO_PUBLIC_WEB_URL;

/**
 * Shareable link to a page of the app. Prefers the public web address so the
 * link opens in a browser for people without the app (and in the app once
 * universal/app links are set up for that domain). Falls back to the current
 * web origin, then to the app's own deep link (chessmate:// in builds,
 * exp://<lan-ip>:8081/--/ in Expo Go).
 */
export function appLink(p: AppPath): string {
  if (typeof webUrl === 'string' && webUrl.length > 0) return `${webUrl.replace(/\/+$/, '')}${pathWithQuery(p)}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${pathWithQuery(p)}`;
  return Linking.createURL(p.path.slice(1), { queryParams: p.query });
}

/** Shareable link for a challenge (see appLink for the host rules). */
export function challengeLink(id: string): string {
  return appLink({ path: challengePath(id) });
}

/**
 * Link to a page of the web app (where tournament entry fees are paid). Null on
 * phones when the web address is not configured (EXPO_PUBLIC_WEB_URL).
 */
export function webLink(path: string): string | null {
  if (typeof webUrl === 'string' && webUrl.length > 0) return `${webUrl.replace(/\/+$/, '')}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${path}`;
  return null;
}

/** Shareable link to a player's profile (what their QR code holds). Same host rules as appLink. */
export function profileLink(username: string): string {
  return appLink({ path: profilePath(username) });
}

type WebNavigator = Navigator & { share?: (d: ShareData) => Promise<void> };

/**
 * True where sharing a link opens a share sheet: the app, and browsers on
 * phones and tablets. Desktop browsers copy the link instead (their share
 * sheets, where they have one, are slower than a paste).
 */
export function sharesWithSheet(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof navigator === 'undefined' || !(navigator as WebNavigator).share) return false;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/**
 * Opens the native share sheet, or copies to the clipboard on desktop browsers.
 * Returns what happened; `cancelled` when the person closed the browser's share sheet.
 */
export async function shareLink(url: string, message: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? (navigator as WebNavigator) : undefined;
      if (nav?.share && sharesWithSheet()) {
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
  } catch (e) {
    return e instanceof Error && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
