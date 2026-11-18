import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { getSettings } from '@/features/account/settingsStore';

/**
 * Original ChessMate sound set. Every file is synthesised in-house (see
 * scripts/synth-sounds.mjs for castle, promote, low time, win and lose), so there is
 * nothing to license.
 */
const SOURCES = {
  move: require('../../assets/sounds/move.wav'),
  capture: require('../../assets/sounds/capture.wav'),
  check: require('../../assets/sounds/check.wav'),
  castle: require('../../assets/sounds/castle.wav'),
  promote: require('../../assets/sounds/promote.wav'),
  start: require('../../assets/sounds/start.wav'),
  end: require('../../assets/sounds/end.wav'),
  premove: require('../../assets/sounds/premove.wav'),
  lowTime: require('../../assets/sounds/lowtime.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

/** Sounds governed by the "Move and capture sounds" setting. */
const MOVE_SOUNDS = new Set<SoundName>(['move', 'capture', 'check', 'castle', 'promote', 'premove']);

let players: Partial<Record<SoundName, AudioPlayer>> = {};
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

/** Whether a sound may play under the user's sound settings. */
export function soundAllowed(name: SoundName, sound = getSettings().sound): boolean {
  if (!sound.enabled || sound.volume <= 0) return false;
  if (MOVE_SOUNDS.has(name)) return sound.moves;
  if (name === 'lowTime') return sound.lowTime;
  return true;
}

export function playSound(name: SoundName): void {
  const { sound } = getSettings();
  if (!soundAllowed(name, sound)) return;
  const p = player(name);
  if (!p) return;
  try {
    p.volume = sound.volume;
    void p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Audio is a nicety; a device without audio output must not break play.
  }
}

/** Sound for a played move, from its SAN. Check wins over everything else. */
export function moveSound(san: string): SoundName {
  if (san.includes('+') || san.includes('#')) return 'check';
  if (san.includes('=')) return 'promote';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}

/** Releases native players (e.g. on sign-out). */
export function unloadSounds() {
  for (const p of Object.values(players)) p?.remove();
  players = {};
}
