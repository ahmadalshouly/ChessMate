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
 * - screens: no screens at all (everything around them still runs)
 * - overlays: no in-app notification and award banners
 * - glass: no glass or blur anywhere (plain tint)
 * - shadows: no shadows anywhere
 * - skeleton: loading placeholders don't pulse
 * - probe: turns nothing off; prints what the app keeps doing to the Expo terminal every 10 s
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

export type HeatPart = 'blank' | 'sounds' | 'socket' | 'engine' | 'keyboard' | 'shell' | 'screens' | 'overlays' | 'glass' | 'shadows' | 'skeleton';

/** True when this part of the app is switched off for a heat test. `blank` switches off everything. */
export function heatOff(part: HeatPart): boolean {
  return parts.has(part) || parts.has('blank') || parts.has('all');
}

/** The parts switched off, for the on-screen note. */
export const heatTestParts = [...parts];
