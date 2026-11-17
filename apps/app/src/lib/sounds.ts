import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Original ChessMate sound set (synthesised, see assets/sounds). */
const SOURCES = {
  move: require('../../assets/sounds/move.wav'),
  capture: require('../../assets/sounds/capture.wav'),
  check: require('../../assets/sounds/check.wav'),
  start: require('../../assets/sounds/start.wav'),
  end: require('../../assets/sounds/end.wav'),
  premove: require('../../assets/sounds/premove.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

let players: Partial<Record<SoundName, AudioPlayer>> = {};
let enabled = true;
let configured = false;

function player(name: SoundName): AudioPlayer | null {
  try {
    if (!configured) {
      configured = true;
      // Game sounds are short cues: never interrupt the user's music.
      void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    players[name] ??= createAudioPlayer(SOURCES[name]);
    return players[name]!;
  } catch {
    return null;
  }
}

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const p = player(name);
  if (!p) return;
  try {
    void p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Audio is a nicety; a device without audio output must not break play.
  }
}

/** Sound for a played move, from its SAN. */
export function moveSound(san: string): SoundName {
  if (san.includes('+') || san.includes('#')) return 'check';
  if (san.includes('x')) return 'capture';
  return 'move';
}

export function setSoundsEnabled(on: boolean) {
  enabled = on;
}

export function soundsEnabled() {
  return enabled;
}

/** Releases native players (e.g. on sign-out). */
export function unloadSounds() {
  for (const p of Object.values(players)) p?.remove();
  players = {};
}
