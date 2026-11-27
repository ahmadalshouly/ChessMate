/**
 * Development switch for tracking down what makes a phone run hot: turns parts of the app off.
 * Set it when starting Expo, e.g. (PowerShell)
 *
 *   $env:EXPO_PUBLIC_HEAT_TEST="blank"; npx expo start --clear
 *
 * Parts (comma-separated):
 * - blank: the app shows a plain screen and starts nothing (no sounds, no screens, no live connection)
 * - sounds: no game sounds are loaded and the audio session is left alone
 * - socket: no live connection to the game server
 * - engine: no on-device Stockfish host
 * - keyboard: no keyboard tracking at the root
 * - shell: no backdrop, header or tab bar around the screens
 *
 * Unset (the normal case) everything runs. Does nothing in release builds.
 */
const raw: string = __DEV__ ? (process.env.EXPO_PUBLIC_HEAT_TEST ?? '') : '';
const parts = new Set(
  raw
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean),
);

export type HeatPart = 'blank' | 'sounds' | 'socket' | 'engine' | 'keyboard' | 'shell';

/** True when this part of the app is switched off for a heat test. `blank` switches off everything. */
export function heatOff(part: HeatPart): boolean {
  return parts.has(part) || parts.has('blank') || parts.has('all');
}

/** The parts switched off, for the on-screen note. */
export const heatTestParts = [...parts];
