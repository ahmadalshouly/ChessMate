// Synthesises ChessMate's win and lose cues as 16-bit mono WAVs (board sounds: synth-wood.mjs).
// Every sample is generated here, so the sounds are original and need no licence.
// Usage: node apps/app/scripts/synth-sounds.mjs
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Seeded noise so the files are byte-identical on every run. */
let seed = 7;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;

/** A soft bell-like tone with a few inharmonic partials. */
function bell(buf, at, freq, dur, gain = 1) {
  const start = Math.round(at * RATE);
  const len = Math.round(dur * RATE);
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-t * (4 / dur));
    const v = Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2.01 * t) + 0.12 * Math.sin(2 * Math.PI * freq * 3.98 * t);
    buf[start + i] += gain * env * v;
  }
}

function write(name, seconds, draw) {
  const buf = new Float32Array(Math.round(seconds * RATE));
  draw(buf);
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const data = Buffer.alloc(buf.length * 2);
  // Normalise to about -3 dBFS and fade the tail to avoid clicks.
  for (let i = 0; i < buf.length; i++) {
    const fade = Math.min(1, (buf.length - i) / (0.01 * RATE));
    data.writeInt16LE(Math.round((buf[i] / peak) * 0.7 * fade * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(out, `${name}.wav`), Buffer.concat([header, data]));
}

/** Applause-like crowd: many tiny filtered claps scattered over time with a swell and fade. */
function cheer(buf, at, dur, gain = 1) {
  const start = Math.round(at * RATE);
  const claps = Math.round(dur * 140);
  for (let c = 0; c < claps; c++) {
    const when = Math.abs(noise()) * dur;
    const swell = Math.sin(Math.PI * Math.min(1, when / dur)) ** 0.6;
    const s0 = start + Math.round(when * RATE);
    const len = Math.round(0.018 * RATE);
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < len && s0 + i < buf.length; i++) {
      const n = noise();
      hp = 0.6 * (hp + n - prev);
      prev = n;
      buf[s0 + i] += gain * 0.22 * swell * hp * Math.exp(-(i / RATE) * 260);
    }
  }
}

// Win: a bright rising fanfare over a short burst of applause.
write('win', 1.6, (b) => {
  bell(b, 0, 523, 0.5, 0.55);
  bell(b, 0.1, 659, 0.5, 0.55);
  bell(b, 0.2, 784, 0.55, 0.6);
  bell(b, 0.32, 1047, 0.9, 0.75);
  bell(b, 0.32, 1319, 0.9, 0.35);
  cheer(b, 0.15, 1.4, 1);
});
// Loss: two warm, low notes stepping gently down. Calm, not a buzzer.
write('lose', 1.1, (b) => {
  bell(b, 0, 440, 0.8, 0.6);
  bell(b, 0.28, 349, 0.9, 0.6);
  bell(b, 0.28, 220, 0.9, 0.25);
});
console.log('wrote win.wav, lose.wav to', out);
