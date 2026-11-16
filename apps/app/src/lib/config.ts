import { Platform } from 'react-native';

const fallback = Platform.OS === 'android' ? 'ws://10.0.2.2:8787/ws' : 'ws://localhost:8787/ws';
const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;

/** Game server WebSocket URL. Set EXPO_PUBLIC_SERVER_URL for real deployments. */
export const SERVER_URL: string = typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : fallback;
