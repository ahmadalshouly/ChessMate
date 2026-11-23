import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { EngineTransport, FarmHandler, FarmOut } from './engineTypes';

export type { EngineTransport, FarmHandler } from './engineTypes';

/**
 * iOS/Android: the engines run as Web Workers inside a hidden WebView
 * (<EngineHost/>, mounted once in the root layout), because React Native's own
 * JavaScript engine has no WebAssembly. The engine files are bundled with the
 * app, so this works offline and needs nothing from the server.
 */

/**
 * Phones get fewer engines than desktops: enough to be quick, without heating
 * up. Android gets two: its WebView runs in a separate process that the system
 * kills first when memory runs low, taking every engine with it.
 */
const MAX_ENGINES = Platform.OS === 'android' ? 2 : 3;
/** Engine files go to the WebView in slices of this many characters (see hostHtml.ts). */
const SLICE = 256 * 1024;
const START_TIMEOUT_MS = 20_000;

interface HostState {
  /** Bumped for every new transport, so the WebView restarts clean. */
  session: number;
  /** The messages that start the engines (engine script and WASM in slices, then init), once loaded. */
  payload: string[] | null;
}

let state: HostState = { session: 0, payload: null };
const subscribers = new Set<() => void>();
let farmHandler: FarmHandler | null = null;
let onReady: ((size: number) => void) | null = null;
let onFail: ((err: Error) => void) | null = null;
let sender: ((msg: string) => void) | null = null;
let payloadCache: Promise<{ js: string; wasm: string }> | null = null;

function setState(next: HostState) {
  state = next;
  subscribers.forEach((fn) => fn());
}

/** For <EngineHost/>: what to render. */
export function useEngineHost(): HostState {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
  );
}

/** For <EngineHost/>: how to post into the WebView (null when it unmounts). */
export function setHostSender(fn: ((msg: string) => void) | null) {
  sender = fn;
}

/** For <EngineHost/>: a message from the page. */
export function hostMessage(raw: string) {
  let m: FarmOut | { t: 'loaded' };
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.t === 'loaded') {
    if (state.payload && sender) for (const msg of state.payload) sender(msg);
  } else if (m.t === 'ready') {
    onReady?.(m.size);
  } else if (m.t === 'error' && onFail) {
    onFail(new Error(m.message || 'Engine failed to start'));
  } else {
    farmHandler?.(m);
  }
}

function loadFiles(): Promise<{ js: string; wasm: string }> {
  payloadCache ??= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles these as assets
    const [js, wasm] = await Asset.loadAsync([require('./assets/stockfish.js.txt'), require('../../../public/engine/stockfish.wasm')]);
    if (!js?.localUri || !wasm?.localUri) throw new Error('Engine files are missing');
    const [jsText, wasmB64] = await Promise.all([new File(js.localUri).text(), new File(wasm.localUri).base64()]);
    return { js: jsText, wasm: wasmB64 };
  })();
  payloadCache.catch(() => (payloadCache = null));
  return payloadCache;
}

export function transportSupported(): boolean {
  return true;
}

function payloadFor(files: { js: string; wasm: string }, max: number): string[] {
  const out: string[] = [];
  for (const k of ['js', 'wasm'] as const) {
    const d = files[k];
    for (let i = 0; i < d.length; i += SLICE) out.push(JSON.stringify({ t: 'part', k, d: d.slice(i, i + SLICE) }));
  }
  out.push(JSON.stringify({ t: 'init', max }));
  return out;
}

export async function openTransport(onMessage: FarmHandler, max = MAX_ENGINES): Promise<EngineTransport> {
  const payload = payloadFor(await loadFiles(), Math.min(max, MAX_ENGINES));
  return new Promise<EngineTransport>((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('The engine did not start')), START_TIMEOUT_MS);
    const close = () => {
      farmHandler = null;
      onReady = onFail = null;
      setState({ session: state.session + 1, payload: null });
    };
    const fail = (err: Error) => {
      clearTimeout(timer);
      close();
      reject(err);
    };
    farmHandler = onMessage;
    onFail = fail;
    onReady = (size) => {
      clearTimeout(timer);
      onReady = onFail = null;
      resolve({
        size,
        send: (msg) => sender?.(JSON.stringify(msg)),
        dispose: close,
      });
    };
    setState({ session: state.session + 1, payload });
  });
}
