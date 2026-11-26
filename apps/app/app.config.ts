import type { ConfigContext, ExpoConfig } from 'expo/config';

// Read through require so the app's tsconfig doesn't need Node's types.
type NetAddress = { family: string | number; internal: boolean; address: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { networkInterfaces } = require('node:os') as { networkInterfaces(): Record<string, NetAddress[] | undefined> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync } = require('node:fs') as { existsSync(path: string): boolean };

/**
 * Wraps app.json. Two additions:
 *
 * 1. `extra.devServerHost`: this computer's Wi-Fi/LAN address, read when Expo
 *    starts. The app uses it to find `pnpm dev:server` when the bundle comes
 *    through `expo start --tunnel` (then Expo's own host is a tunnel name, not
 *    the laptop). Left out of EAS builds.
 * 2. Sign in with Apple and Google: the Apple capability, the app's bundle ID
 *    as a URL scheme, and Google's native sign-in SDK. On iOS that SDK needs
 *    the iOS client ID reversed (com.googleusercontent.apps.…) as a URL scheme,
 *    taken from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID; Android needs nothing here.
 *    See docs/sign-in-with-google-and-apple.md.
 *
 * 3. Push on Android: Expo sends Android push through Firebase Cloud Messaging,
 *    and the app needs the Firebase project's google-services.json to get a
 *    push token. It is read from the EAS file variable GOOGLE_SERVICES_JSON,
 *    or ./google-services.json when present (it is not secret, but keep it out
 *    of git if you prefer). See docs/PUSH_NOTIFICATIONS.md.
 *
 * Store builds (EAS profile "production") must name a public wss:// game
 * server, or the app would look for one on the local network. The build
 * stops here instead of shipping that.
 */
function lanAddress(): string | undefined {
  const virtual = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|tailscale|zerotier|vpn/i;
  const candidates: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !virtual.test(name)) candidates.push({ name, address: a.address });
    }
  }
  const privateRange = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const score = (c: { name: string; address: string }) => (/wi-?fi|wlan|wireless|en0/i.test(c.name) ? 2 : 0) + (privateRange(c.address) ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0]?.address;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.EAS_BUILD_PROFILE === 'production' && !/^wss:\/\/[^/]+/.test(process.env.EXPO_PUBLIC_SERVER_URL ?? '')) {
    throw new Error('Production builds need EXPO_PUBLIC_SERVER_URL set to the public game server, e.g. wss://chessmate-server.fly.dev/ws (eas.json → build.production.env)');
  }
  const base = config as ExpoConfig;
  const scheme = Array.isArray(base.scheme) ? base.scheme : base.scheme ? [base.scheme] : [];
  const bundleId = base.ios?.bundleIdentifier ?? 'com.chessmate.app';
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (existsSync('./google-services.json') ? './google-services.json' : undefined);
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !googleServicesFile) {
    console.warn('No google-services.json (EAS variable GOOGLE_SERVICES_JSON): this Android build cannot receive push notifications. See docs/PUSH_NOTIFICATIONS.md');
  }
  const googleIos = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const googleIosScheme = googleIos ? `com.googleusercontent.apps.${googleIos.replace(/\.apps\.googleusercontent\.com$/, '')}` : undefined;
  if (process.env.EAS_BUILD_PLATFORM === 'ios' && !googleIosScheme) {
    console.warn('No EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: this iOS build has no Google sign-in. See docs/sign-in-with-google-and-apple.md');
  }
  return {
    ...base,
    scheme: [...new Set([...scheme, bundleId])],
    ios: { ...base.ios, usesAppleSignIn: true },
    android: { ...base.android, ...(googleServicesFile ? { googleServicesFile } : null) },
    plugins: [
      ...(base.plugins ?? []),
      'expo-apple-authentication',
      ...(googleIosScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosScheme }] as [string, unknown]] : []),
    ],
    extra: {
      ...base.extra,
      ...(process.env.EAS_BUILD ? null : { devServerHost: process.env.EXPO_PUBLIC_DEV_SERVER_HOST || lanAddress() }),
    },
  };
};
