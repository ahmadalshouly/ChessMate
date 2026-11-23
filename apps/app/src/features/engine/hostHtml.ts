import { FARM_SOURCE } from './farmSource';

/**
 * The page the iOS/Android app loads in a hidden WebView to run Stockfish.
 * React Native's JavaScript engine has no WebAssembly, but the system WebView
 * does, with Web Workers, so the engines run there on the phone's own cores.
 * The page also runs the engine queue (farmSource.ts), so only finished
 * results cross back to the app.
 *
 * Protocol (JSON strings both ways):
 *   app -> page  {t:'part', k:'js'|'wasm', d}           the engine files, a slice at a time
 *                {t:'init', max}                        start the engines from the parts
 *                (or {t:'init', js, wasm (base64), max} in one message)
 *                any farm message ({t:'search'|'cancel', ...})
 *
 * The files go in slices because Android hands each message to the page as a
 * script to evaluate, and one multi-megabyte script is slow and fragile there.
 *   page -> app  {t:'loaded'} then farm messages ({t:'ready'|'result'|'cancelled'|'error', ...})
 */
export const ENGINE_HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
${FARM_SOURCE}
(function () {
  var farm = null;
  var parts = { js: [], wasm: [] };
  function post(m) { (window.ReactNativeWebView || window.parent).postMessage(JSON.stringify(m), '*'); }
  function bytes(b64) {
    var s = atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function init(m) {
    try {
      if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') throw new Error('This WebView cannot run the engine');
      var wasm = URL.createObjectURL(new Blob([bytes(m.wasm || parts.wasm.join(''))], { type: 'application/wasm' }));
      // The engine's only download is its .wasm, so every fetch gets the bytes
      // above (its own guess at the URL is wrong inside a blob: worker).
      var shim = 'var __sfWasm=' + JSON.stringify(wasm) + ';var __sfFetch=self.fetch.bind(self);' +
        'self.fetch=function(u,o){return __sfFetch(__sfWasm,o)};\\n';
      var js = URL.createObjectURL(new Blob([shim, m.js || parts.js.join('')], { type: 'text/javascript' }));
      parts = { js: [], wasm: [] };
      var cores = navigator.hardwareConcurrency || 2;
      var size = Math.max(1, Math.min(m.max || 2, cores - 1));
      farm = createFarm(function (onLine, onError) {
        var w = new Worker(js);
        w.onmessage = function (e) { onLine(e.data); };
        w.onerror = function (e) { onError((e && e.message) || 'engine failed to load'); };
        return w;
      }, size, post);
    } catch (err) {
      post({ t: 'error', message: String((err && err.message) || err) });
    }
  }
  function onMessage(e) {
    var m;
    try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (_) { return; }
    if (!m) return;
    if (m.t === 'part') { if (!farm && parts[m.k]) parts[m.k].push(m.d); }
    else if (m.t === 'init') { if (!farm) init(m); }
    else if (farm) farm(m);
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);
  post({ t: 'loaded' });
})();
</script></body></html>`;
