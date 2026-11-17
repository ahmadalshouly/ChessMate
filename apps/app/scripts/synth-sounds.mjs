// Synthesises ChessMate's castle, promote and low-time cues as 16-bit mono WAVs.
// Every sample is generated here, so the sounds are original and need no licence.
// Usage: node apps/app/scripts/synth-sounds.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Seeded noise so the files are byte-identical on every run. */
let seed = 7;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;

/** A short wooden knock: filtered noise burst plus a damped low body tone. */
function knock(buf, at, gain = 1, pitch = 1) {
  const start = Math.round(at * RATE);
  const len = Math.round(0.09 * RATE);
  let lp = 0;
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / RATE;
    lp += 0.35 * (noise() - lp);
    const click = lp * Math.exp(-t * 90);
    const body = Math.sin(2 * Math.PI * 190 * pitch * t) * Math.exp(-t * 38) + 0.5 * Math.sin(2 * Math.PI * 410 * pitch * t) * Math.exp(-t * 60);
    buf[start + i] += gain * (0.55 * click + 0.6 * body);
  }
}

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

// King and rook landing: two knocks, the second slightly higher.
write('castle', 0.24, (b) => {
  knock(b, 0, 1, 1);
  knock(b, 0.085, 0.9, 1.18);
});
// Promotion: a knock and a rising two-note chime.
write('promote', 0.5, (b) => {
  knock(b, 0, 0.8);
  bell(b, 0.03, 784, 0.35, 0.5);
  bell(b, 0.12, 1175, 0.38, 0.55);
});
// Low time: two short, soft ticks that stand out without startling.
write('lowtime', 0.42, (b) => {
  bell(b, 0, 1320, 0.12, 0.8);
  bell(b, 0.2, 1320, 0.12, 0.8);
});
console.log('wrote castle.wav, promote.wav, lowtime.wav to', out);
