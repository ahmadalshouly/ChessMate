import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORT = 8787;

/**
 * In development, a phone or emulator reaches the game server on the same
 * machine that serves the JS bundle. Expo reports that machine as `hostUri`
 * (e.g. "192.168.1.20:8081"), so we reuse its host when it is a LAN address.
 * With `expo start --tunnel` the host is a tunnel name instead, so we fall back
 * to the computer's Wi-Fi address that app.config.ts read when Expo started.
 */
function devServerUrl(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  const isLan = !!host && (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost');
  if (isLan) return `ws://${host}:${PORT}/ws`;
  const lan = (Constants.expoConfig?.extra as { devServerHost?: unknown } | undefined)?.devServerHost;
  if (__DEV__ && typeof lan === 'string' && lan) return `ws://${lan}:${PORT}/ws`;
  return null;
}

function fallback(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `ws://${window.location.hostname}:${PORT}/ws`;
  }
  return devServerUrl() ?? (Platform.OS === 'android' ? `ws://10.0.2.2:${PORT}/ws` : `ws://localhost:${PORT}/ws`);
}

const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;

/** Game server WebSocket URL. EXPO_PUBLIC_SERVER_URL wins when set. */
export const SERVER_URL: string = typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : fallback();

function httpBaseFromWs(wsUrl: string): string {
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    return `${u.protocol}//${u.host}`;
  } catch {
    return `http://localhost:${PORT}`;
  }
}

const apiFromEnv = process.env.EXPO_PUBLIC_API_URL;

/**
 * HTTP API base (accounts, auth). Defaults to the game server's host and port,
 * so one `pnpm dev:server` serves both. EXPO_PUBLIC_API_URL wins when set.
 */
export const API_URL: string = (
  typeof apiFromEnv === 'string' && apiFromEnv.length > 0 ? apiFromEnv : httpBaseFromWs(SERVER_URL)
).replace(/\/+$/, '');
