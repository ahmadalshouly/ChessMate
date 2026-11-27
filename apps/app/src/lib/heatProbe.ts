import { DeviceEventEmitter } from 'react-native';

import { heatTestParts } from './heatTest';

/**
 * EXPO_PUBLIC_HEAT_TEST=probe: counts what the app's JavaScript does while it should be idle
 * (timers, animation frames, React renders, socket messages) and prints a summary to the Expo
 * terminal every 10 seconds, so busy work on a real phone shows up by name.
 */
export const probing = heatTestParts.includes('probe');

const counts = new Map<string, number>();
let renders = 0;
const renderers = new Map<string, number>();

function caller(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(3, 7);
  return lines
    .map((l) => l.trim().replace(/^at /, '').replace(/\s*\(.*\)$/, ''))
    .filter(Boolean)
    .join(' < ')
    .slice(0, 160);
}

function bump(kind: string) {
  const key = `${kind} ${caller()}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** For <Profiler onRender>: one React commit in the named part of the app. */
export function onProbeRender(id: string) {
  renders++;
  renderers.set(id, (renderers.get(id) ?? 0) + 1);
}

/** Counts one render of the named component (call at the top of its body). */
export function useProbe(name: string) {
  if (!probing) return;
  const key = `render ${name}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Counts a message that arrived over the live connection. */
export function probeSocket(type: string) {
  if (!probing) return;
  counts.set(`socket ${type}`, (counts.get(`socket ${type}`) ?? 0) + 1);
}

if (probing) {
  const g = globalThis as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'setImmediate'] as const) {
    const orig = g[name];
    if (typeof orig !== 'function') continue;
    g[name] = function (this: unknown, ...args: unknown[]) {
      bump(name === 'setTimeout' || name === 'setInterval' ? `${name}(${String(args[1] ?? 0)})` : name);
      return orig.apply(this, args);
    };
  }
  // Native events (app state, appearance, dimensions, keyboard, sockets, ...) by name.
  const emitter = DeviceEventEmitter as unknown as { emit: (type: string, ...a: unknown[]) => void };
  const emit = emitter.emit.bind(emitter);
  emitter.emit = (type: string, ...a: unknown[]) => {
    const key = `event ${type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    emit(type, ...a);
  };
  const expoEmitter = (globalThis as { expo?: { EventEmitter?: { prototype: { emit: (this: unknown, type: string, ...a: unknown[]) => void } } } }).expo?.EventEmitter?.prototype;
  if (expoEmitter?.emit) {
    const orig = expoEmitter.emit;
    expoEmitter.emit = function (type: string, ...a: unknown[]) {
      const key = `expo-event ${type}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return orig.call(this, type, ...a);
    };
  }
  const report = () => {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    const parts = [...renderers.entries()].map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`[heat] last 10 s: ${renders} React renders (${parts || 'none'})`);
    for (const [k, v] of top) console.log(`[heat]   ${v}× ${k}`);
    if (!top.length) console.log('[heat]   no timers or frames');
    counts.clear();
    renderers.clear();
    renders = 0;
  };
  // The reporter's own timer shows up once per report, which is easy to tell apart.
  setInterval(report, 10_000);
}
