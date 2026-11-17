import type { ConfigContext, ExpoConfig } from 'expo/config';

// Read through require so the app's tsconfig doesn't need Node's types.
type NetAddress = { family: string | number; internal: boolean; address: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { networkInterfaces } = require('node:os') as { networkInterfaces(): Record<string, NetAddress[] | undefined> };

/**
 * Wraps app.json. Two additions:
 *
 * 1. `extra.devServerHost`: this computer's Wi-Fi/LAN address, read when Expo
 *    starts. The app uses it to find `pnpm dev:server` when the bundle comes
 *    through `expo start --tunnel` (then Expo's own host is a tunnel name, not
 *    the laptop). Left out of EAS builds.
 * 2. Sign in with Apple and Google: the Apple capability, and the app's bundle
 *    ID as a URL scheme so Google can redirect back to installed builds.
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
  const base = config as ExpoConfig;
  const scheme = Array.isArray(base.scheme) ? base.scheme : base.scheme ? [base.scheme] : [];
  const bundleId = base.ios?.bundleIdentifier ?? 'com.chessmate.app';
  return {
    ...base,
    scheme: [...new Set([...scheme, bundleId])],
    ios: { ...base.ios, usesAppleSignIn: true },
    plugins: [...(base.plugins ?? []), 'expo-apple-authentication'],
    extra: {
      ...base.extra,
      ...(process.env.EAS_BUILD ? null : { devServerHost: process.env.EXPO_PUBLIC_DEV_SERVER_HOST || lanAddress() }),
    },
  };
};
