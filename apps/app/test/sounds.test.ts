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
type Listener = (s: { isLoaded: boolean; didJustFinish: boolean; error?: string }) => void;
class FakePlayer {
  static all: FakePlayer[] = [];
  isLoaded = false;
  playing = false;
  currentTime = 0;
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
  replaced = 0;
  replace() {
    this.replaced++;
    this.isLoaded = false;
  }
  fail(error = 'Source error') {
    this.isLoaded = false;
    this.listener?.({ isLoaded: false, didJustFinish: false, error });
  }
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

const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-asset', () => ({ Asset: { fromModule: (src: string) => ({ uri: `http://dev-server/${src}` }) } }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

vi.mock('expo-audio', () => ({
  createAudioPlayer: (src: unknown) => new FakePlayer(src),
  setAudioModeAsync: () => Promise.resolve(),
}));
vi.mock('@/features/account/settingsStore', () => ({
  getSettings: () => ({ sound: { enabled: true, volume: 1, moves: true, lowTime: true, haptics: false, playOnSilent: false } }),
}));

type Sounds = typeof import('../src/lib/sounds');
let sounds: Sounds;

beforeEach(async () => {
  vi.resetModules();
  FakePlayer.all = [];
  platform.OS = 'ios';
  sounds = await import('../src/lib/sounds');
});

describe('illegal-move sound', () => {
  it('plays the illegal.wav cue', () => {
    sounds.playSound('illegal');
    const played = FakePlayer.all.filter((p) => p.plays > 0);
    expect(played).toHaveLength(1);
    expect(String(played[0]!.source)).toMatch(/illegal\.wav$/);
  });

  it('follows the "Move and capture sounds" setting', () => {
    const off = { enabled: true, volume: 1, moves: false, lowTime: true, haptics: false, playOnSilent: false };
    expect(sounds.soundAllowed('illegal', off)).toBe(false);
    expect(sounds.soundAllowed('illegal', { ...off, moves: true })).toBe(true);
  });
});

describe('Android', () => {
  const movePlayers = () => FakePlayer.all.filter((p) => /move1\.wav$/.test(String(p.source)));

  it('plays a move asked for while its file is loading once it has loaded', () => {
    platform.OS = 'android';
    sounds.playSound('move');
    const [p] = movePlayers();
    expect(p!.plays).toBe(0);
    p!.load();
    expect(p!.plays).toBe(1);
  });

  it('reloads a sound whose file failed to load instead of staying silent', () => {
    platform.OS = 'android';
    sounds.preloadSounds();
    const [p] = movePlayers();
    p!.fail();
    expect(p!.replaced).toBe(1);
    sounds.playSound('move');
    p!.load();
    expect(p!.plays).toBe(1);
  });
});
