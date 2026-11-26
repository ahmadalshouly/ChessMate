import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * Google sign-in on Android and iPhone, through Google's own native SDK
 * (@react-native-google-signin/google-signin): the system account picker on
 * Android, Google's sheet on iOS. The ID token it returns is for the *web*
 * client ID (Android) or the iOS client ID (iOS); the server accepts both.
 *
 * The native module is not in Expo Go, and importing it there throws, so it is
 * only required inside an installed build.
 */

export const googleClientIds = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
};

/** Expo Go has neither the native Google module nor the app's own URL scheme. */
export const googleBlockedByExpoGo = Platform.OS !== 'web' && isRunningInExpoGo();

/** Android needs the web client ID (to get an ID token); iOS needs the iOS client ID. */
export function googleNativeReady(os: string = Platform.OS, ids = googleClientIds): boolean {
  if (os === 'android') return !!ids.web;
  if (os === 'ios') return !!ids.ios;
  return false;
}

export class GoogleCancelled extends Error {}

/** Android's "DEVELOPER_ERROR" (code 10): the app's package + SHA-1 don't match an Android client in Google Cloud. */
export class GoogleSetupError extends Error {}

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let configured = false;
function load(): GoogleSigninModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  if (!configured) {
    mod.GoogleSignin.configure({ webClientId: googleClientIds.web, iosClientId: googleClientIds.ios, scopes: ['email', 'profile'] });
    configured = true;
  }
  return mod;
}

/** Opens Google's account picker and returns the ID token. */
export async function signInWithGoogleNative(): Promise<{ idToken: string; fullName?: string }> {
  if (googleBlockedByExpoGo) throw new Error('Google sign-in is not available in Expo Go');
  const { GoogleSignin, isErrorWithCode, statusCodes } = load();
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Sign out of the SDK's cached account first so the picker always shows.
    await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (res.type === 'cancelled') throw new GoogleCancelled();
    const idToken = res.data.idToken;
    if (!idToken) throw new Error('No ID token (is EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID set?)');
    return { idToken, fullName: res.data.user.name ?? undefined };
  } catch (e) {
    if (e instanceof GoogleCancelled) throw e;
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) throw new GoogleCancelled();
      if (String(e.code) === '10' || /DEVELOPER_ERROR/.test(e.message)) throw new GoogleSetupError(e.message);
    }
    throw e;
  }
}
