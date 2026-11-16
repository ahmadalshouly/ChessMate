import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORT = 8787;

/**
 * In development, a phone or emulator reaches the game server on the same
 * machine that serves the JS bundle. Expo reports that machine as `hostUri`
 * (e.g. "192.168.1.20:8081"), so we reuse its host when it is a LAN address.
 */
function devServerUrl(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host) return null;
  const isLan = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
  return isLan ? `ws://${host}:${PORT}/ws` : null;
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
