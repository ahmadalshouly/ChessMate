import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { getSettings } from '@/features/account/settingsStore';

/**
 * Original ChessMate sound set. Every file is synthesised in-house (see
 * scripts/synth-sounds.mjs for castle, promote, low time, win, lose, premove and
 * illegal), so there is nothing to license. Credits: assets/sounds/CREDITS.md.
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
  illegal: require('../../assets/sounds/illegal.wav'),
  lowTime: require('../../assets/sounds/lowtime.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

/** Sounds governed by the "Move and capture sounds" setting. */
const MOVE_SOUNDS = new Set<SoundName>(['move', 'capture', 'check', 'castle', 'promote', 'premove', 'illegal']);

/**
 * Players per sound. Two moves can land within a few milliseconds (the
 * opponent's move and your premove answering it), so each cue gets a second
 * player instead of restarting, and cutting off, the one still sounding.
 */
const VOICES = 2;
/** A cue asked for while its file is still loading plays if it loads within this window. */
const LATE_START_MS = 800;

interface Voice {
  player: AudioPlayer;
  loaded: boolean;
  /** Rewound to 0 and ready to start instantly. */
  atStart: boolean;
  /** When it last started, to free a voice whose finish event never came. */
  startedAt: number;
  /** When a play was asked for before the file loaded. */
  pendingSince: number | null;
  /** Bumped on every start, so a rewind that lands after a newer start is ignored. */
  gen: number;
}

let voices: Partial<Record<SoundName, Voice[]>> = {};
let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  // Game sounds are short cues: never interrupt the user's music.
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

function createVoice(name: SoundName): Voice {
  const player = createAudioPlayer(SOURCES[name]);
  const v: Voice = { player, loaded: player.isLoaded, atStart: true, startedAt: 0, pendingSince: null, gen: 0 };
  player.addListener('playbackStatusUpdate', (s) => {
    if (s.isLoaded && !v.loaded) {
      v.loaded = true;
      const asked = v.pendingSince;
      v.pendingSince = null;
      if (asked !== null && Date.now() - asked < LATE_START_MS) start(v);
    }
    // Rewind as soon as a cue ends, so the next play starts without waiting on a seek.
    if (s.didJustFinish) rewind(v);
  });
  return v;
}

function rewind(v: Voice) {
  const gen = v.gen;
  v.startedAt = 0;
  v.player
    .seekTo(0)
    .then(() => {
      if (v.gen === gen) v.atStart = true;
    })
    .catch(() => {});
}

function start(v: Voice) {
  const gen = ++v.gen;
  v.startedAt = Date.now();
  if (v.atStart) {
    v.atStart = false;
    v.player.play();
    return;
  }
  // Not rewound yet (still sounding, or the finish event was missed). Calling
  // play() before the seek lands can do nothing on a finished native player, so
  // wait for the seek first. This race was what dropped some move sounds.
  v.player.pause();
  void v.player
    .seekTo(0)
    .then(() => {
      if (v.gen === gen) v.player.play();
    })
    .catch(() => {});
}

function voicesFor(name: SoundName): Voice[] | null {
  try {
    configure();
    voices[name] ??= Array.from({ length: VOICES }, () => createVoice(name));
    return voices[name]!;
  } catch {
    return null;
  }
}

/**
 * Creates every player up front so the first move, capture or premove of a
 * session is not lost while its file loads. Safe to call more than once.
 */
export function preloadSounds() {
  for (const name of Object.keys(SOURCES) as SoundName[]) voicesFor(name);
}

/** Picks the voice that can sound soonest: idle and rewound, then idle, then the oldest. */
function pickVoice(list: Voice[], now: number): Voice {
  const idle = (v: Voice) => v.startedAt === 0 || now - v.startedAt > 1500;
  return (
    list.find((v) => v.loaded && v.atStart && idle(v)) ??
    list.find((v) => v.loaded && idle(v)) ??
    list.find((v) => v.loaded) ??
    list.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b))
  );
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
  const list = voicesFor(name);
  if (!list) return;
  try {
    const now = Date.now();
    const v = pickVoice(list, now);
    v.player.volume = sound.volume;
    if (!v.loaded && !v.player.isLoaded) {
      // Still loading: play the moment it is ready rather than dropping the cue.
      v.pendingSince = now;
      return;
    }
    v.loaded = true;
    start(v);
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
  for (const list of Object.values(voices)) for (const v of list ?? []) v.player.remove();
  voices = {};
}
