// Synthesises ChessMate's board sounds: wooden pieces set down on a wooden board,
// captures, castling, check, promotion, premove, the clock press that starts a game,
// the knock that ends it and the low-time clock ticks.
//
// Physical modelling: each impact is a short contact click (filtered noise), the
// ringing of the piece (a few high, quickly damped modes) and the board's body (low
// modes that ring longer), placed in a small wooden room (early reflections plus a
// short diffuse tail). Several takes per sound vary pitch, weight and timing slightly,
// so repeated moves sound like real play instead of one sample on repeat.
//
// Every sample is generated here: the sounds are original and need no licence.
// Usage: node apps/app/scripts/synth-wood.mjs
import { Buffer } from 'node:buffer';
import { unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** Seeded random numbers, so every run writes byte-identical files. */
let seed = 20261122;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const noise = () => rand() * 2 - 1;
const around = (v, spread) => v * (1 + (rand() * 2 - 1) * spread);

const buffer = (seconds) => new Float64Array(Math.round(seconds * RATE));

/** Two-pole resonant band-pass (RBJ), applied in place from `start`. */
function bandpass(x, freq, q) {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * One wooden piece meeting the board.
 * gain: loudness; weight: how firmly it lands (more board body); bright: piece size
 * (higher = smaller, harder piece); felt: a felted base softens the click.
 */
function impact(buf, at, { gain = 1, weight = 1, bright = 1, felt = 0.35 } = {}) {
  const start = Math.round(at * RATE);
  const len = Math.min(Math.round(0.22 * RATE), buf.length - start);
  if (len <= 0) return;
  // Contact click: a few milliseconds of noise, shaped like hard wood (3–6 kHz).
  const raw = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const env = (1 - Math.exp(-t / 0.00025)) * Math.exp(-t / (0.0016 * (1 - felt * 0.6)));
    raw[i] = noise() * env;
  }
  const click = bandpass(raw, around(4200 * bright, 0.06), 1.4);
  const knock = bandpass(raw, around(1900 * bright, 0.05), 3);
  // Modes: the piece rings high and short, the board low and longer.
  const piece = [
    [1650, 1, 0.009],
    [2470, 0.62, 0.0065],
    [3720, 0.36, 0.0042],
    [5150, 0.2, 0.0026],
  ];
  const board = [
    [128, 0.85, 0.042],
    [214, 0.8, 0.033],
    [347, 0.55, 0.024],
    [528, 0.42, 0.017],
    [877, 0.26, 0.011],
  ];
  const kp = around(bright, 0.04);
  const kb = around(1, 0.05);
  const modes = [
    ...piece.map(([f, a, tau]) => ({ f: around(f * kp, 0.015), a: a * 0.55 * (1 - felt * 0.4), tau: around(tau, 0.1), ph: rand() * 6.283 })),
    ...board.map(([f, a, tau]) => ({ f: around(f * kb, 0.02), a: a * 0.6 * weight, tau: around(tau * (0.8 + 0.2 * weight), 0.1), ph: rand() * 6.283 })),
  ];
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const attack = 1 - Math.exp(-t / 0.0004);
    let ring = 0;
    for (const m of modes) ring += m.a * Math.exp(-t / m.tau) * Math.sin(2 * Math.PI * m.f * t + m.ph);
    buf[start + i] += gain * (0.9 * click[i] * (1 - felt * 0.5) + 0.7 * knock[i] + attack * ring);
  }
}

/** A plain damped tone (wood block, soft chime partials). */
function tone(buf, at, freq, gain, tau, attackTau = 0.002) {
  const start = Math.round(at * RATE);
  const len = Math.min(Math.round(tau * 7 * RATE), buf.length - start);
  const ph = rand() * 6.283;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    buf[start + i] += gain * (1 - Math.exp(-t / attackTau)) * Math.exp(-t / tau) * Math.sin(2 * Math.PI * freq * t + ph);
  }
}

/** A mechanical click (clock button, escapement tick): bright noise plus a hard high mode. */
function mechClick(buf, at, gain = 1, pitch = 1) {
  const start = Math.round(at * RATE);
  const len = Math.min(Math.round(0.05 * RATE), buf.length - start);
  const raw = new Float64Array(len);
  for (let i = 0; i < len; i++) raw[i] = noise() * Math.exp(-i / RATE / 0.0011);
  const hi = bandpass(raw, 5200 * pitch, 2);
  const mid = bandpass(raw, 2300 * pitch, 6);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    buf[start + i] += gain * (hi[i] * 1.1 + mid[i] * 1.4 + 0.35 * Math.exp(-t / 0.006) * Math.sin(2 * Math.PI * 3100 * pitch * t));
  }
}

/** A small wooden room: early reflections and a short, dark diffuse tail. */
function room(x, mix = 0.16) {
  const y = Float64Array.from(x);
  for (const [ms, g] of [
    [6.1, 0.3],
    [9.7, 0.24],
    [13.3, 0.19],
    [17.9, 0.14],
    [23.4, 0.1],
  ]) {
    const d = Math.round((ms / 1000) * RATE);
    for (let i = d; i < y.length; i++) y[i] += g * x[i - d];
  }
  const tail = new Float64Array(x.length);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.round((ms / 1000) * RATE);
    const line = new Float64Array(x.length);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const fb = i >= d ? line[i - d] : 0;
      lp += 0.35 * (fb - lp);
      line[i] = x[i] + 0.42 * lp;
      tail[i] += line[i] - x[i];
    }
  }
  for (let i = 0; i < y.length; i++) y[i] += mix * tail[i];
  return y;
}

/** Normalises to a peak, fades the last milliseconds and trims trailing silence. */
function finish(x, peak) {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  const k = max ? peak / max : 1;
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1] * k) < 0.0006) end--;
  end = Math.min(x.length, end + Math.round(0.01 * RATE));
  const y = x.slice(0, end).map((v) => v * k);
  const fade = Math.min(y.length, Math.round(0.012 * RATE));
  for (let i = 0; i < fade; i++) y[y.length - 1 - i] *= i / fade;
  return y;
}

function wav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2));
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

const make = (name, seconds, peak, draw) => {
  const b = buffer(seconds);
  draw(b);
  wav(name, finish(room(b), peak));
};

// A piece set down: four takes.
for (let v = 1; v <= 4; v++) {
  make(`move${v}`, 0.3, 0.8, (b) => impact(b, 0.004, { weight: around(1, 0.12), bright: around(1, 0.06), felt: around(0.35, 0.2) }));
}
// Capture: the taken piece knocked aside, then the capturing piece lands firmly.
for (let v = 1; v <= 3; v++) {
  make(`capture${v}`, 0.36, 0.9, (b) => {
    impact(b, 0.004, { gain: 0.5, weight: 0.45, bright: around(1.22, 0.05), felt: 0.15 });
    impact(b, around(0.07, 0.15), { gain: 1, weight: around(1.3, 0.08), bright: around(1.05, 0.04), felt: 0.25 });
  });
}
// Castling: king, then rook.
for (let v = 1; v <= 2; v++) {
  make(`castle${v}`, 0.42, 0.82, (b) => {
    impact(b, 0.004, { weight: 1.05, bright: 0.96 });
    impact(b, around(0.13, 0.08), { gain: 0.85, weight: 0.95, bright: 1.04 });
  });
}
// Check: a firm placement with a hollow wood-block note on top.
for (let v = 1; v <= 2; v++) {
  make(`check${v}`, 0.45, 0.88, (b) => {
    impact(b, 0.004, { weight: 1.2, bright: 1.02, felt: 0.25 });
    tone(b, 0.045, around(880, 0.01), 0.32, 0.055);
    tone(b, 0.045, around(1760 * 1.01, 0.01), 0.1, 0.03);
  });
}
// Promotion: the new piece set down with a soft two-partial chime.
make('promote', 0.9, 0.82, (b) => {
  impact(b, 0.004, { weight: 1.1 });
  tone(b, 0.06, 1318.5, 0.16, 0.22, 0.004);
  tone(b, 0.06, 1975.5, 0.09, 0.16, 0.004);
  tone(b, 0.15, 2637, 0.06, 0.14, 0.004);
});
// Premove queued: a light fingertip tap.
make('premove', 0.2, 0.32, (b) => impact(b, 0.004, { gain: 0.6, weight: 0.3, bright: 1.35, felt: 0.6 }));
// Game start: a chess clock pressed.
make('start', 0.32, 0.7, (b) => {
  mechClick(b, 0.004, 1, 1);
  impact(b, 0.012, { gain: 0.45, weight: 0.8, bright: 0.8, felt: 0.7 });
  mechClick(b, 0.1, 0.45, 1.08);
});
// Game end: a heavier knock and a low resonance of the board.
make('end', 0.8, 0.85, (b) => {
  impact(b, 0.004, { weight: 1.7, bright: 0.85, felt: 0.2 });
  tone(b, 0.008, 98, 0.35, 0.12, 0.003);
  tone(b, 0.008, 196, 0.12, 0.08, 0.003);
});
// Low time: two ticks of a mechanical clock.
make('lowtime', 0.75, 0.6, (b) => {
  mechClick(b, 0.004, 1, 1);
  mechClick(b, 0.5, 0.85, 0.94);
});

// Files from the previous single-take set.
for (const old of ['move', 'capture', 'castle', 'check']) {
  const f = join(out, `${old}.wav`);
  if (existsSync(f)) unlinkSync(f);
}
console.log('wrote board sounds to', out);
