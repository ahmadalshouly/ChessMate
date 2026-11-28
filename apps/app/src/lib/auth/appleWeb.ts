/**
 * Sign in with Apple on the web, through Apple's own JS (popup mode). Apple has
 * no web SDK in expo-apple-authentication, so this loads appleid.auth.js once
 * and opens Apple's pop-up. It needs a Services ID (EXPO_PUBLIC_APPLE_SERVICES_ID)
 * whose Return URLs include this site's address exactly, and only works over
 * https on a domain registered with that Services ID (Apple refuses localhost).
 */

const SCRIPT_URL = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

export const appleServicesId = process.env.EXPO_PUBLIC_APPLE_SERVICES_ID || undefined;

interface AppleSignInResponse {
  authorization?: { id_token?: string; code?: string; state?: string };
  user?: { email?: string; name?: { firstName?: string; lastName?: string } };
}

interface AppleIDGlobal {
  auth: {
    init(config: { clientId: string; scope: string; redirectURI: string; state?: string; nonce?: string; usePopup: boolean }): void;
    signIn(): Promise<AppleSignInResponse>;
  };
}

export class AppleWebCancelled extends Error {}

/** Apple's web pop-up only works over https, on a real domain. */
export function appleWebSupported(location: { protocol: string; hostname: string } | undefined = globalThis.location): boolean {
  if (!location) return false;
  return location.protocol === 'https:' && location.hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);
}

/** Turns Apple's pop-up answer into the ID token and (first time only) the person's name. */
export function readAppleResponse(res: unknown): { idToken: string; fullName?: string } {
  const r = (res ?? {}) as AppleSignInResponse & { error?: string };
  if (r.error) {
    if (r.error === 'popup_closed_by_user' || r.error === 'user_cancelled_authorize') throw new AppleWebCancelled(r.error);
    throw new Error(`Apple sign-in error: ${r.error}`);
  }
  const idToken = r.authorization?.id_token;
  if (!idToken) throw new Error('No identity token');
  const fullName = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(' ') || undefined;
  return { idToken, fullName };
}

let loading: Promise<AppleIDGlobal> | null = null;

function loadAppleScript(): Promise<AppleIDGlobal> {
  const existing = (globalThis as { AppleID?: AppleIDGlobal }).AppleID;
  if (existing) return Promise.resolve(existing);
  return (loading ??= new Promise<AppleIDGlobal>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => {
      const apple = (globalThis as { AppleID?: AppleIDGlobal }).AppleID;
      if (apple) resolve(apple);
      else reject(new Error('Apple sign-in script did not load'));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('Apple sign-in script did not load'));
    };
    document.head.appendChild(s);
  }));
}

/** Starts loading Apple's script early so the pop-up opens straight from the click (browsers block late pop-ups). */
export function preloadAppleWeb(): void {
  if (appleServicesId && typeof document !== 'undefined') loadAppleScript().catch(() => {});
}

/** Opens Apple's pop-up and returns the ID token. Throws AppleWebCancelled when the person closes it. */
export async function signInWithAppleWeb(): Promise<{ idToken: string; fullName?: string }> {
  if (!appleServicesId) throw new Error('EXPO_PUBLIC_APPLE_SERVICES_ID is not set');
  const apple = await loadAppleScript();
  apple.auth.init({ clientId: appleServicesId, scope: 'name email', redirectURI: window.location.origin, usePopup: true });
  let res: unknown;
  try {
    res = await apple.auth.signIn();
  } catch (e) {
    // Apple rejects with { error } objects, not Errors.
    res = e;
  }
  return readAppleResponse(res);
}
