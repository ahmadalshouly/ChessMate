import { FARM_SOURCE } from './farmSource';

/**
 * The page the iOS/Android app loads in a hidden WebView to run Stockfish.
 * React Native's JavaScript engine has no WebAssembly, but the system WebView
 * does, with Web Workers, so the engines run there on the phone's own cores.
 * The page also runs the engine queue (farmSource.ts), so only finished
 * results cross back to the app.
 *
 * Protocol (JSON strings both ways):
 *   app -> page  {t:'init', js, wasm (base64), max}   start the engines
 *                any farm message ({t:'search'|'cancel', ...})
 *   page -> app  {t:'loaded'} then farm messages ({t:'ready'|'result'|'cancelled'|'error', ...})
 */
export const ENGINE_HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
${FARM_SOURCE}
(function () {
  var farm = null;
  function post(m) { (window.ReactNativeWebView || window.parent).postMessage(JSON.stringify(m), '*'); }
  function bytes(b64) {
    var s = atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function init(m) {
    try {
      var wasm = URL.createObjectURL(new Blob([bytes(m.wasm)], { type: 'application/wasm' }));
      // The engine fetches its .wasm next to its own URL, or from the URL in its hash.
      var shim = 'var __sfWasm=' + JSON.stringify(wasm) + ';var __sfFetch=self.fetch.bind(self);' +
        'self.fetch=function(u,o){return __sfFetch(/wasm/i.test(String(u))?__sfWasm:u,o)};\\n';
      var js = URL.createObjectURL(new Blob([shim, m.js], { type: 'text/javascript' }));
      var cores = navigator.hardwareConcurrency || 2;
      var size = Math.max(1, Math.min(m.max || 2, cores - 1));
      farm = createFarm(function (onLine, onError) {
        var w = new Worker(js + '#' + encodeURIComponent(wasm));
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
    if (m.t === 'init') { if (!farm) init(m); }
    else if (farm) farm(m);
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);
  post({ t: 'loaded' });
})();
</script></body></html>`;
