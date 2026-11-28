import type { AnalyticsProps } from '@chessmate/core';

/**
 * Google Analytics 4 on the website, through gtag.js. The script is added to
 * the page only after the visitor allows analytics, with Consent Mode set so
 * that only analytics storage is granted (never ads). Withdrawing turns it off
 * and deletes GA's cookies. Set EXPO_PUBLIC_GA_MEASUREMENT_ID (G-XXXXXXX) for
 * the web build; without it nothing is loaded.
 */
const MEASUREMENT_ID = (process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID ?? '').trim();

type Gtag = (...args: unknown[]) => void;
type GaWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag } & Record<string, unknown>;

let loaded = false;
let enabled = false;

function win(): GaWindow | null {
  return typeof window !== 'undefined' && typeof document !== 'undefined' ? (window as unknown as GaWindow) : null;
}

function gtag(...args: unknown[]) {
  const w = win();
  if (!w) return;
  w.dataLayer = w.dataLayer ?? [];
  // gtag.js expects the arguments object itself, not an array.
  w.gtag = w.gtag ?? function gtagShim() { w.dataLayer!.push(arguments); };
  w.gtag(...args);
}

export const googleConfigured = () => MEASUREMENT_ID.length > 0;
export const googleName = () => (MEASUREMENT_ID ? `Google Analytics 4 (${MEASUREMENT_ID})` : null);

export function googleSetEnabled(on: boolean) {
  const w = win();
  if (!w || !MEASUREMENT_ID || on === enabled) return;
  enabled = on;
  w[`ga-disable-${MEASUREMENT_ID}`] = !on;
  if (on) {
    if (!loaded) {
      loaded = true;
      gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
      gtag('js', new Date());
      // Screens are sent by the app (route patterns, no ids), so GA's automatic page views stay off.
      gtag('config', MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
      document.head.appendChild(s);
    }
    gtag('consent', 'update', { analytics_storage: 'granted' });
  } else {
    gtag('consent', 'update', { analytics_storage: 'denied' });
    deleteGaCookies();
  }
}

function deleteGaCookies() {
  const host = location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (!name || !(name === '_ga' || name.startsWith('_ga_') || name === '_gid')) continue;
    for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`;
  }
}

export function googleEvent(name: string, props?: AnalyticsProps) {
  if (enabled) gtag('event', name, props ?? {});
}

export function googleScreen(screen: string) {
  if (!enabled) return;
  gtag('event', 'page_view', { page_title: screen, page_location: `${location.origin}${screen}`, page_path: screen });
}

export function googleUser(id: string | null) {
  if (enabled) gtag('set', { user_id: id ?? undefined });
}
