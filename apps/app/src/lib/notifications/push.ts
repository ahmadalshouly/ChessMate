import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { notificationsApi } from './api';
import { translate } from '@/i18n';

export type PushStatus =
  | { state: 'unknown' }
  | { state: 'enabled'; token: string }
  | { state: 'denied' }
  | { state: 'unsupported'; reason: string }
  | { state: 'error'; reason: string };

export const pushSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Expo Go on Android cannot receive remote push since SDK 53; a development build can. */
const isExpoGoAndroid = Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Whether the remote push token APIs can be touched at all. In Expo Go on
 * Android `getExpoPushTokenAsync` and `addPushTokenListener` do not fail
 * softly: expo-notifications throws, which takes the whole screen down. Check
 * this before calling either.
 */
export const pushTokensAvailable = pushSupported && !isExpoGoAndroid;

function unsupportedReason(): string | null {
  if (!pushSupported) return translate('notifications.push.webOnly');
  if (!Device.isDevice) return translate('notifications.push.simulator');
  if (isExpoGoAndroid) return translate('notifications.push.expoGo');
  return null;
}

export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'ChessMate',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#FFFFFF',
    vibrationPattern: [0, 180, 120, 180],
  });
}

/** Reads the current permission without prompting. */
export async function currentPushStatus(): Promise<PushStatus> {
  const reason = unsupportedReason();
  if (reason) return { state: 'unsupported', reason };
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'denied') return { state: 'denied' };
  if (status !== 'granted') return { state: 'unknown' };
  return register();
}

/** Asks for permission if needed, then registers this device's Expo push token with the server. */
export async function enablePush(): Promise<PushStatus> {
  const reason = unsupportedReason();
  if (reason) return { state: 'unsupported', reason };
  await setupAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  const status = existing.status === 'granted' ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { state: 'denied' };
  return register();
}

async function register(): Promise<PushStatus> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await notificationsApi.registerPushToken(token, Platform.OS);
    return { state: 'enabled', token };
  } catch (e) {
    return { state: 'error', reason: e instanceof Error ? e.message : translate('notifications.push.failed') };
  }
}

export async function disablePush(token: string) {
  await notificationsApi.unregisterPushToken(token).catch(() => undefined);
}
