import { engineCount, type EngineTransport, type FarmHandler, type FarmOut } from './engineTypes';
import { FARM_SOURCE } from './farmSource';
import { FULL_ENGINE_MAX, checkFullEngine, fullEngineSource } from './fullEngine';
import { reviewSettings } from './reviewSettings';

export type { EngineTransport, FarmHandler } from './engineTypes';

/** Served from public/engine (see scripts/vendor-engine.mjs). */
const ENGINE_PATH = '/engine/stockfish.js';
const START_TIMEOUT_MS = 20_000;

/**
 * Runs the farm in a worker of its own, which starts one Stockfish worker per
 * engine. With a `full` source, the full build's parts are read from this browser's
 * cache storage and joined once into one in-memory file that every engine
 * loads (Stockfish.js takes its .wasm address after the # of its script's);
 * any part missing, and the lite build starts instead.
 */
const BOOT = `
var farm, queued = [];
function start(url, size) {
  farm = createFarm(function (onLine, onError) {
    var w = new Worker(url);
    w.onmessage = function (ev) { onLine(ev.data); };
    w.onerror = function (ev) { onError((ev && ev.message) || 'engine failed to load'); };
    return w;
  }, size, function (out) { postMessage(out); });
  queued.forEach(function (q) { farm(q); });
  queued = [];
}
function joinParts(full) {
  return caches.open(full.cache).then(function (cache) {
    return Promise.all(full.parts.map(function (u) {
      return cache.match(u).then(function (r) { if (!r) throw new Error('missing ' + u); return r.blob(); });
    }));
  }).then(function (blobs) {
    return URL.createObjectURL(new Blob(blobs, { type: 'application/wasm' }));
  });
}
onmessage = function (e) {
  var m = e.data;
  if (m && m.t === 'init') {
    if (!m.full) return start(m.url, m.size);
    joinParts(m.full).then(
      function (wasm) { start(m.full.js + '#' + encodeURIComponent(wasm), m.fullSize); },
      function () { start(m.url, m.size); }
    );
  } else if (farm) farm(m);
  else queued.push(m);
};`;

export function transportSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof Blob !== 'undefined';
}

/**
 * Web: Stockfish compiled to WebAssembly, one Web Worker per spare core, fed by
 * a coordinating worker so the page's own rendering never holds the engines up.
 */
export async function openTransport(onMessage: FarmHandler, max = 4): Promise<EngineTransport> {
  if (!transportSupported()) throw new Error('This browser cannot run the engine');
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  const size = engineCount(cores, max);
  // The full build when picked in Settings and downloaded (fewer engines: each needs far more memory).
  let full: ReturnType<typeof fullEngineSource> = null;
  if (reviewSettings().engine === 'full') {
    await checkFullEngine();
    full = fullEngineSource();
  }
  const blobUrl = URL.createObjectURL(new Blob([FARM_SOURCE, BOOT], { type: 'text/javascript' }));
  const farm = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);
  return new Promise((resolve, reject) => {
    let ready = false;
    const timer = setTimeout(() => fail('The engine did not start'), START_TIMEOUT_MS);
    const fail = (message: string) => {
      clearTimeout(timer);
      farm.terminate();
      if (!ready) reject(new Error(message));
      else onMessage({ t: 'error', message });
    };
    farm.onerror = (e: ErrorEvent) => fail(e.message || 'Engine failed');
    farm.onmessage = (e: MessageEvent<FarmOut>) => {
      const m = e.data;
      if (!ready && m.t === 'ready') {
        ready = true;
        clearTimeout(timer);
        resolve({ size: m.size, send: (msg) => farm.postMessage(msg), dispose: () => farm.terminate() });
      } else if (!ready && m.t === 'error') fail(m.message);
      else onMessage(m);
    };
    farm.postMessage({ t: 'init', url: new URL(ENGINE_PATH, window.location.href).href, size, full, fullSize: engineCount(cores, Math.min(max, FULL_ENGINE_MAX)) });
  });
}
