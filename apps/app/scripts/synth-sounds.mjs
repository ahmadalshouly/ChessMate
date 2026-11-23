// Synthesises ChessMate's castle, promote, low-time, win, lose, premove and illegal-move cues as 16-bit mono WAVs.
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

function write(name, seconds, draw, level = 0.7) {
  const buf = new Float32Array(Math.round(seconds * RATE));
  draw(buf);
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const data = Buffer.alloc(buf.length * 2);
  // Normalise (about -3 dBFS by default) and fade the tail to avoid clicks.
  for (let i = 0; i < buf.length; i++) {
    const fade = Math.min(1, (buf.length - i) / (0.01 * RATE));
    data.writeInt16LE(Math.round((buf[i] / peak) * level * fade * 32767), i * 2);
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

// Premove queued: two quick, light, high ticks. Clearly not a piece landing, so the
// player hears that the move is waiting rather than played.
write('premove', 0.14, (b) => {
  bell(b, 0, 1760, 0.05, 0.9);
  knock(b, 0, 0.35, 2.4);
  bell(b, 0.06, 2093, 0.06, 0.8);
}, 0.5);

/** A muffled low thud whose pitch sags, like a piece bumping the board edge. */
function thud(buf, at, freq, dur, gain = 1) {
  const start = Math.round(at * RATE);
  const len = Math.round(dur * RATE);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * freq * (1 - 0.25 * Math.min(1, t / dur))) / RATE;
    const tone = Math.sin(phase) + 0.3 * Math.sin(2 * phase);
    lp += 0.18 * (noise() - lp);
    const env = Math.min(1, t / 0.003) * Math.exp(-t * (5 / dur));
    buf[start + i] += gain * env * (0.85 * tone + 0.25 * lp);
  }
}

// Illegal move: two soft, low, falling thuds. Says "no" without sounding like an alarm.
write('illegal', 0.3, (b) => {
  thud(b, 0, 196, 0.12, 1);
  thud(b, 0.1, 147, 0.17, 0.9);
}, 0.6);
console.log('wrote castle, promote, lowtime, win, lose, premove and illegal .wav files to', out);
