import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { getSettings } from '@/features/account/settingsStore';

/**
 * ChessMate's own sound set: wooden pieces on a wooden board, modelled physically by
 * scripts/synth-wood.mjs (win and lose by scripts/synth-sounds.mjs), so there is
 * nothing to license. Moves, captures, castling and check come in several takes that
 * are rotated, so repeated moves sound like real play.
 */
const SOURCES = {
  move: [require('../../assets/sounds/move1.wav'), require('../../assets/sounds/move2.wav'), require('../../assets/sounds/move3.wav'), require('../../assets/sounds/move4.wav')],
  capture: [require('../../assets/sounds/capture1.wav'), require('../../assets/sounds/capture2.wav'), require('../../assets/sounds/capture3.wav')],
  check: [require('../../assets/sounds/check1.wav'), require('../../assets/sounds/check2.wav')],
  castle: [require('../../assets/sounds/castle1.wav'), require('../../assets/sounds/castle2.wav')],
  promote: [require('../../assets/sounds/promote.wav')],
  start: [require('../../assets/sounds/start.wav')],
  end: [require('../../assets/sounds/end.wav')],
  premove: [require('../../assets/sounds/premove.wav')],
  lowTime: [require('../../assets/sounds/lowtime.wav')],
  win: [require('../../assets/sounds/win.wav')],
  lose: [require('../../assets/sounds/lose.wav')],
} as const;

export type SoundName = keyof typeof SOURCES;

/** Sounds governed by the "Move and capture sounds" setting. */
const MOVE_SOUNDS = new Set<SoundName>(['move', 'capture', 'check', 'castle', 'promote', 'premove']);

/**
 * Players per sound: every take of it, at least two, used in turn. A sound that is
 * still ringing is never cut off or skipped when the next move comes quickly.
 */
let pools: Partial<Record<SoundName, AudioPlayer[]>> = {};
const turn: Partial<Record<SoundName, number>> = {};
let configured = false;

function pool(name: SoundName): AudioPlayer[] {
  if (!configured) {
    configured = true;
    // Game sounds are short cues: never interrupt the user's music.
    void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }
  let list = pools[name];
  if (!list) {
    const takes: readonly number[] = SOURCES[name];
    const count = Math.max(2, takes.length);
    list = [];
    for (let i = 0; i < count; i++) {
      try {
        list.push(createAudioPlayer(takes[i % takes.length]!));
      } catch {
        // No audio on this device.
      }
    }
    pools[name] = list;
  }
  return list;
}

/**
 * Loads every sound up front. A player created at the moment of the first move is
 * still loading and stays silent, which is how the first move, capture or check of a
 * session could go unheard.
 */
export function preloadSounds() {
  for (const name of Object.keys(SOURCES) as SoundName[]) pool(name);
}

/** Whether a sound may play under the user's sound settings. */
export function soundAllowed(name: SoundName, sound = getSettings().sound): boolean {
  if (!sound.enabled || sound.volume <= 0) return false;
  if (MOVE_SOUNDS.has(name)) return sound.moves;
  if (name === 'lowTime') return sound.lowTime;
  return true;
}

/** The last move that made a sound, so a move reported twice (game logic and board) plays once. */
let lastMove = { key: '', at: 0 };

/** Position part of a FEN (pieces and side to move): what identifies a move's result. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 2).join(' ');
}

/**
 * Plays a move's sound once per resulting position: the board and the game logic may
 * both report the same move, only the first does.
 */
export function playMoveSound(name: SoundName, fenAfter?: string): void {
  if (fenAfter) {
    const key = positionKey(fenAfter);
    const now = Date.now();
    if (key === lastMove.key && now - lastMove.at < 1500) return;
    lastMove = { key, at: now };
  }
  playSound(name);
}

export function playSound(name: SoundName): void {
  const { sound } = getSettings();
  if (!soundAllowed(name, sound)) return;
  const list = pool(name);
  if (!list.length) return;
  const i = (turn[name] ?? 0) % list.length;
  turn[name] = i + 1;
  const p = list[i]!;
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
  for (const list of Object.values(pools)) for (const p of list ?? []) p.remove();
  pools = {};
}
