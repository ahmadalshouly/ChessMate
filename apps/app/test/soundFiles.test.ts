import { describe, expect, it } from 'vitest';

// Node's fs, imported by name so the app's typecheck, which has no Node types, stays clean.
const fsName = 'node:fs';
const fs = (await import(fsName)) as {
  readdirSync: (dir: URL) => string[];
  readFileSync: { (file: URL): Uint8Array; (file: URL, encoding: 'utf8'): string };
};

const soundsDir = new URL('../assets/sounds/', import.meta.url);

/**
 * Android's player (ExoPlayer) writes a sound into the phone's audio buffer, 0.25-0.75 s
 * long depending on the phone, while it waits paused for play(). A file that fits in it
 * whole reaches its end before play() and is then never heard: the move and illegal-move
 * sounds (0.3 s) were silent on Android while capture and check (0.35 s) played. The
 * synth scripts pad every file with silence to this length (MIN_SECONDS there).
 */
const MIN_SECONDS = 1;

/** Duration of a PCM WAV file, from its fmt and data chunks. */
function wavSeconds(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  expect(tag(0)).toBe('RIFF');
  expect(tag(8)).toBe('WAVE');
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') byteRate = view.getUint32(at + 16, true);
    if (tag(at) === 'data') return size / byteRate;
    at += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

const files = fs.readdirSync(soundsDir).filter((f) => f.endsWith('.wav'));

describe('sound files', () => {
  it('include every file the app plays', () => {
    const source = fs.readFileSync(new URL('../src/lib/sounds.ts', import.meta.url), 'utf8');
    const used = [...source.matchAll(/assets\/sounds\/([\w-]+\.wav)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(10);
    for (const f of used) expect(files).toContain(f);
  });

  it.each(files)('%s lasts long enough to play on Android', (f) => {
    expect(wavSeconds(fs.readFileSync(new URL(f, soundsDir)))).toBeGreaterThanOrEqual(MIN_SECONDS);
  });
});
