import { beforeEach, describe, expect, it, vi } from 'vitest';

// Metro turns require('x.wav') into an asset id; in Node, stand in the file name.
// (Imported by name so the app's typecheck, which has no Node types, stays clean.)
const nodeModule = 'node:module';
type Loader = (m: { exports: unknown }, file: string) => void;
const { default: Module } = (await import(nodeModule)) as { default: { _extensions: Record<string, Loader> } };
Module._extensions['.wav'] = (m, file) => {
  m.exports = file;
};

// A fake expo-audio player that records calls and lets a test drive load,
// finish and seek completion like the native module does.
type Listener = (s: { isLoaded: boolean; didJustFinish: boolean }) => void;
class FakePlayer {
  static all: FakePlayer[] = [];
  isLoaded = false;
  playing = false;
  volume = 1;
  plays = 0;
  seeks: (() => void)[] = [];
  listener: Listener | null = null;
  constructor(readonly source: unknown) {
    FakePlayer.all.push(this);
  }
  addListener(_: string, fn: Listener) {
    this.listener = fn;
  }
  play() {
    this.plays++;
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  seekTo() {
    return new Promise<void>((resolve) => this.seeks.push(resolve));
  }
  remove() {}
  load() {
    this.isLoaded = true;
    this.listener?.({ isLoaded: true, didJustFinish: false });
  }
  finish() {
    this.playing = false;
    this.listener?.({ isLoaded: true, didJustFinish: true });
  }
  /** Lets every pending seek land. */
  async settle() {
    for (const r of this.seeks.splice(0)) r();
    await Promise.resolve();
    await Promise.resolve();
  }
}

vi.mock('expo-audio', () => ({
  createAudioPlayer: (src: unknown) => new FakePlayer(src),
  setAudioModeAsync: () => Promise.resolve(),
}));
vi.mock('@/features/account/settingsStore', () => ({
  getSettings: () => ({ sound: { enabled: true, volume: 1, moves: true, lowTime: true, haptics: false } }),
}));

type Sounds = typeof import('../src/lib/sounds');
let sounds: Sounds;

beforeEach(async () => {
  vi.resetModules();
  FakePlayer.all = [];
  sounds = await import('../src/lib/sounds');
});

/** The move cue's two players: move is the first cue created, preloaded or not. */
const playersOf = () => FakePlayer.all.slice(0, 2);

describe('sounds', () => {
  it('plays two moves in quick succession on separate players', () => {
    sounds.preloadSounds();
    const [a, b] = playersOf();
    a!.load();
    b!.load();
    sounds.playSound('move');
    sounds.playSound('move');
    expect(a!.plays + b!.plays).toBe(2);
    expect(a!.plays).toBe(1);
  });

  it('does not drop a cue asked for while the file is still loading', () => {
    sounds.playSound('move');
    const players = playersOf();
    expect(players.every((p) => p.plays === 0)).toBe(true);
    for (const p of players) p.load();
    expect(players.reduce((n, p) => n + p.plays, 0)).toBe(1);
  });

  it('waits for the rewind before replaying a finished player', async () => {
    sounds.preloadSounds();
    const [a, b] = playersOf();
    a!.load();
    b!.load();
    sounds.playSound('move');
    sounds.playSound('move');
    // Both have played and neither has been rewound yet (no finish event).
    a!.finish();
    sounds.playSound('move');
    // a's rewind is still in flight: it must not call play() before the seek lands.
    const before = a!.plays + b!.plays;
    expect(before).toBe(2);
    await a!.settle();
    await b!.settle();
    expect(a!.plays + b!.plays).toBe(3);
  });

  it('starts instantly once a finished player has been rewound', async () => {
    sounds.preloadSounds();
    const [a, b] = playersOf();
    a!.load();
    b!.load();
    sounds.playSound('move');
    a!.finish();
    await a!.settle();
    sounds.playSound('move');
    expect(a!.plays + b!.plays).toBe(2);
  });

  it('maps illegal and premove cues to the move-sound setting', () => {
    const off = { enabled: true, volume: 1, moves: false, lowTime: true, haptics: false };
    expect(sounds.soundAllowed('illegal', off)).toBe(false);
    expect(sounds.soundAllowed('premove', off)).toBe(false);
    expect(sounds.soundAllowed('illegal', { ...off, moves: true })).toBe(true);
  });
});
