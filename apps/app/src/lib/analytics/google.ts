import type { AnalyticsProps } from '@chessmate/core';
import { isRunningInExpoGo } from 'expo';

/**
 * Firebase Analytics (Google Analytics for the apps) through
 * @react-native-firebase. It needs a development or store build with the
 * Firebase files (google-services.json, GoogleService-Info.plist); in Expo Go,
 * or a build without them, every call here does nothing.
 *
 * Collection is off by default (firebase.json) and switched on only after the
 * visitor allows analytics; ad storage, ad personalisation and the advertising
 * id stay off. Withdrawing switches it off and resets the app's analytics id.
 */
type Fa = typeof import('@react-native-firebase/analytics');
type Instance = ReturnType<Fa['getAnalytics']>;

let fa: Fa | null = null;
let instance: Instance | null = null;
let tried = false;
let enabled = false;

function load(): { fa: Fa; a: Instance } | null {
  if (!tried) {
    tried = true;
    if (isRunningInExpoGo()) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fa = require('@react-native-firebase/analytics') as Fa;
      instance = fa.getAnalytics();
    } catch (e) {
      fa = null;
      instance = null;
      console.info('[analytics] Firebase Analytics is not in this build:', e instanceof Error ? e.message : e);
    }
  }
  return fa && instance ? { fa, a: instance } : null;
}

const quietly = (p: unknown) => {
  if (p instanceof Promise) p.catch(() => undefined);
};

export const googleConfigured = () => load() !== null;
export const googleName = () => (load() ? 'Firebase Analytics' : null);

export function googleSetEnabled(on: boolean) {
  const f = load();
  if (!f || on === enabled) return;
  enabled = on;
  quietly(f.fa.setConsent(f.a, { analytics_storage: on, ad_storage: false, ad_user_data: false, ad_personalization: false }));
  quietly(f.fa.setAnalyticsCollectionEnabled(f.a, on));
  if (!on) quietly(f.fa.resetAnalyticsData(f.a));
}

export function googleEvent(name: string, props?: AnalyticsProps) {
  const f = enabled ? load() : null;
  if (f) quietly(f.fa.logEvent(f.a, name, props));
}

export function googleScreen(screen: string) {
  const f = enabled ? load() : null;
  if (f) quietly(f.fa.logEvent(f.a, 'screen_view', { screen_name: screen, screen_class: screen }));
}

export function googleUser(id: string | null) {
  const f = enabled ? load() : null;
  if (f) quietly(f.fa.setUserId(f.a, id));
}
