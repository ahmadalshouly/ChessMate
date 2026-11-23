import { engineCount, type EngineTransport, type FarmHandler, type FarmOut } from './engineTypes';
import { FARM_SOURCE } from './farmSource';

export type { EngineTransport, FarmHandler } from './engineTypes';

/** Served from public/engine (see scripts/vendor-engine.mjs). */
const ENGINE_PATH = '/engine/stockfish.js';
const START_TIMEOUT_MS = 20_000;

/** Runs the farm in a worker of its own, which starts one Stockfish worker per engine. */
const BOOT = `
var farm;
onmessage = function (e) {
  var m = e.data;
  if (m && m.t === 'init') {
    farm = createFarm(function (onLine, onError) {
      var w = new Worker(m.url);
      w.onmessage = function (ev) { onLine(ev.data); };
      w.onerror = function (ev) { onError((ev && ev.message) || 'engine failed to load'); };
      return w;
    }, m.size, function (out) { postMessage(out); });
  } else if (farm) farm(m);
};`;

export function transportSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof Blob !== 'undefined';
}

/**
 * Web: Stockfish compiled to WebAssembly, one Web Worker per spare core, fed by
 * a coordinating worker so the page's own rendering never holds the engines up.
 */
export function openTransport(onMessage: FarmHandler): Promise<EngineTransport> {
  if (!transportSupported()) return Promise.reject(new Error('This browser cannot run the engine'));
  const size = engineCount(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined, 4);
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
    farm.postMessage({ t: 'init', url: new URL(ENGINE_PATH, window.location.href).href, size });
  });
}
